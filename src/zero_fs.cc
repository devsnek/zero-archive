#include <uv.h>
#include <string>

#include "v8.h"
#include "zero.h"

using v8::Array;
using v8::ArrayBuffer;
using v8::ArrayBufferView;
using v8::BigInt;
using v8::Context;
using v8::External;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::Integer;
using v8::Isolate;
using v8::Local;
using v8::Number;
using v8::Object;
using v8::Persistent;
using v8::Promise;
using v8::String;
using v8::Value;

namespace zero {
namespace fs {

class ZeroReq {
 public:
  explicit ZeroReq(Isolate* isolate,
                   const char* type,
                   void* data = nullptr) :
    isolate_(isolate),
    type_(const_cast<char*>(type)),
    data_(data) {
      resolver_.Reset(isolate_, Promise::Resolver::New(isolate_));
    }

  ~ZeroReq() {
    isolate_ = nullptr;
    resolver_.Reset();
  }

  inline Isolate* isolate() const { return isolate_; }
  inline char* type() const { return type_; }
  inline void* data() const { return data_; }
  inline Local<Promise::Resolver> resolver() const {
    return resolver_.Get(isolate_);
  }
  inline Local<Promise> promise() {
    return resolver_.Get(isolate_)->GetPromise();
  }

  inline void finish(Local<Value> v) {
    v8::HandleScope scope(isolate_);
    Local<Context> context = isolate_->GetCurrentContext();
    if (v->IsNativeError()) {
      resolver()->Reject(context, v).ToChecked();
    } else {
      resolver()->Resolve(context, v).ToChecked();
    }
  }

  inline void fail(int err) {
    std::string e = type();
    e += ": ";
    e += uv_strerror(err);
    Local<Object> v = v8::Exception::Error(ZERO_STRING(isolate_, e.c_str())).As<Object>();
    v->Set(
        v->CreationContext(),
        ZERO_STRING(isolate_, "code"),
        Number::New(isolate_, err)).ToChecked();
    finish(v);
  }

 private:
  Isolate* isolate_;
  char* type_;
  void* data_;
  Persistent<Promise::Resolver> resolver_;
};

Local<Value> normalize_req(Isolate* isolate, uv_fs_t* req) {
  if (req->fs_type == UV_FS_ACCESS)
    return v8::Boolean::New(isolate, req->result >= 0);

  auto data = reinterpret_cast<ZeroReq*>(req->data);
  Local<Context> context = isolate->GetCurrentContext();

  switch (req->fs_type) {
    case UV_FS_CLOSE:
    case UV_FS_RENAME:
    case UV_FS_UNLINK:
    case UV_FS_RMDIR:
    case UV_FS_MKDIR:
    case UV_FS_FTRUNCATE:
    case UV_FS_FSYNC:
    case UV_FS_FDATASYNC:
    case UV_FS_LINK:
    case UV_FS_SYMLINK:
    case UV_FS_CHMOD:
    case UV_FS_FCHMOD:
    case UV_FS_CHOWN:
    case UV_FS_FCHOWN:
    case UV_FS_UTIME:
    case UV_FS_FUTIME:
      return v8::Boolean::New(isolate, true);

    case UV_FS_OPEN:
    case UV_FS_SENDFILE:
    case UV_FS_WRITE:
      return v8::Integer::New(isolate, req->result);

    case UV_FS_STAT:
    case UV_FS_LSTAT:
    case UV_FS_FSTAT: {
      const uv_stat_t* s = &req->statbuf;
      Local<Array> table = Array::New(isolate);
      int i = 0;
#define V(name) \
      USE(table->Set(context, i++, v8::Integer::New(isolate, s->st_##name)))
      V(dev);
      V(mode);
      V(nlink);
      V(uid);
      V(gid);
      V(rdev);
      V(ino);
      V(size);
      V(blksize);
      V(blocks);
      V(flags);
      V(gen);
#undef V
#define V(name) \
      USE(table->Set(context, i++, v8::BigInt::New(isolate, s->st_##name.tv_sec))); \
      USE(table->Set(context, i++, v8::BigInt::New(isolate, s->st_##name.tv_nsec)));
      V(atim);
      V(mtim);
      V(ctim);
      V(birthtim);
#undef V
      const char* type = NULL;
      if (S_ISREG(s->st_mode))
        type = "file";
      else if (S_ISDIR(s->st_mode))
        type = "directory";
      else if (S_ISLNK(s->st_mode))
        type = "link";
      else if (S_ISFIFO(s->st_mode))
        type = "fifo";
#ifdef S_ISSOCK
      else if (S_ISSOCK(s->st_mode))
        type = "socket";
#endif
      else if (S_ISCHR(s->st_mode))
        type = "char";
      else if (S_ISBLK(s->st_mode))
        type = "block";
      if (type)
        USE(table->Set(context, ZERO_STRING(isolate, "type"), ZERO_STRING(isolate, type)));

      return table;
    }

    case UV_FS_MKDTEMP:
      return ZERO_STRING(isolate, req->path);

    case UV_FS_READLINK:
    case UV_FS_REALPATH:
      return ZERO_STRING(isolate, reinterpret_cast<char*>(req->ptr));

    case UV_FS_READ:
      return v8::Uint8Array::New(
          ArrayBuffer::New(isolate, reinterpret_cast<char*>(data->data()), req->result),
          0, req->result);

    case UV_FS_SCANDIR: {
      Local<Array> table = Array::New(isolate, 0);
      for (int i = 0; ; i += 1) {
        uv_dirent_t ent;
        int r = uv_fs_scandir_next(req, &ent);
        if (r == UV_EOF) {
          break;
        }
        if (r != 0) {
          return v8::Exception::Error(ZERO_STRING(isolate, "scandir error"));
        }
        Local<Array> entry = Array::New(isolate, 2);
        entry->Set(context, 0, ZERO_STRING(isolate, ent.name)).ToChecked();
        entry->Set(context, 1, Number::New(isolate, ent.type)).ToChecked();
        table->Set(context, i, entry).ToChecked();
      }
      return table;
    }

    default:
      return v8::Exception::Error(ZERO_STRING(isolate, "UNKNOWN FS TYPE"));
  }
}

void fs_cb(uv_fs_t* req) {
  auto data = reinterpret_cast<ZeroReq*>(req->data);
  Isolate* isolate = data->isolate();
  InternalCallbackScope callback_scope(isolate);
  if (req->fs_type != UV_FS_ACCESS && req->result < 0) {
    data->fail(req->result);
  } else {
    Local<Value> v = normalize_req(isolate, req);
    data->finish(v);
  }
  delete data;
  delete req;
}

#define FS_CALL(func, args, oobData, ...) {                                   \
  ZeroReq* data = new ZeroReq(args.GetIsolate(), #func, oobData);             \
  uv_fs_t* req = new uv_fs_t;                                                 \
  req->data = data;                                                           \
  args.GetReturnValue().Set(data->promise());                                 \
  int ret = uv_fs_##func(uv_default_loop(), req, __VA_ARGS__, fs_cb);         \
  if (req->fs_type != UV_FS_ACCESS && ret < 0) {                              \
    data->fail(req->result);                                                  \
    delete data;                                                              \
    delete req;                                                               \
  }                                                                           \
}

static void Open(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  String::Utf8Value path(isolate, args[0]);
  int flags = args[1]->Int32Value();
  int mode = args[2]->Int32Value();

  FS_CALL(open, args, nullptr, *path, flags, mode);
}

static void Close(const FunctionCallbackInfo<Value>& args) {
  uv_file file = args[0]->Int32Value();

  FS_CALL(close, args, nullptr, file);
}

static void Stat(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  String::Utf8Value path(isolate, args[0]);

  FS_CALL(stat, args, nullptr, *path);
}

static void FStat(const FunctionCallbackInfo<Value>& args) {
  uv_file file = args[0]->Int32Value();

  FS_CALL(fstat, args, nullptr, file);
}

static void Read(const FunctionCallbackInfo<Value>& args) {
  uv_file file = args[0]->Uint32Value();
  int64_t len = args[1]->IntegerValue();
  int64_t offset = args[2]->IntegerValue();

  char* buffer = Malloc(len);

  uv_buf_t buf = uv_buf_init(buffer, len);

  FS_CALL(read, args, buf.base, file, &buf, 1, offset);
}

static void Write(const FunctionCallbackInfo<Value>& args) {
  uv_file file = args[0]->Uint32Value();
  int64_t offset = args[1]->IntegerValue();

  Local<ArrayBufferView> ui = args[2].As<ArrayBufferView>();
  ArrayBuffer::Contents ab_c = ui->Buffer()->GetContents();
  auto base = static_cast<char*>(ab_c.Data()) + ui->ByteOffset();

  uv_buf_t buf[] = {
    {
      .base = base,
      .len = static_cast<size_t>(ab_c.ByteLength()),
    },
  };

  FS_CALL(write, args, nullptr, file, buf, 1, offset);
}

static void Scandir(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  String::Utf8Value path(isolate, args[0]);

  FS_CALL(scandir, args, nullptr, *path, 0);
}

static void Realpath(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  String::Utf8Value path(isolate, args[0]);

  FS_CALL(realpath, args, nullptr, *path);
}

static void Unlink(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  String::Utf8Value path(isolate, args[0]);

  FS_CALL(unlink, args, nullptr, *path);
}

static void Rmdir(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  String::Utf8Value path(isolate, args[0]);

  FS_CALL(unlink, args, nullptr, *path);
}

static void Mkdir(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  String::Utf8Value path(isolate, args[0]);
  int mode = args[1]->Int32Value();

  FS_CALL(mkdir, args, nullptr, *path, mode);
}

static void Symlink(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  String::Utf8Value from(isolate, args[0]);
  String::Utf8Value to(isolate, args[1]);

  FS_CALL(symlink, args, nullptr, *from, *to, 0);
}

static void Copy(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  String::Utf8Value from(isolate, args[0]);
  String::Utf8Value to(isolate, args[1]);
  int flags = args[2]->Int32Value();

  FS_CALL(copyfile, args, nullptr, *from, *to, flags);
}

static void Rename(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  String::Utf8Value from(isolate, args[0]);
  String::Utf8Value to(isolate, args[1]);

  FS_CALL(rename, args, nullptr, *from, *to);
}

static void Utime(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  String::Utf8Value path(isolate, args[0]);
  double atime = args[1]->NumberValue();
  double mtime = args[2]->NumberValue();

  FS_CALL(utime, args, nullptr, *path, atime, mtime);
}

static void FUtime(const FunctionCallbackInfo<Value>& args) {
  uv_file file = args[0]->Uint32Value();
  double atime = args[1]->NumberValue();
  double mtime = args[2]->NumberValue();

  FS_CALL(futime, args, nullptr, file, atime, mtime);
}

class ZeroEvent {
 public:
  ZeroEvent(Isolate* isolate, Local<Value> cb) :
    isolate(isolate) {
    callback.Reset(isolate, cb.As<Function>());
  }
  ~ZeroEvent() {
    callback.Reset();
  }

  Isolate* isolate;
  Persistent<Function> callback;
};

void fs_event_cb(uv_fs_event_t* handle, const char* filename, int events, int) {
  auto data = reinterpret_cast<ZeroEvent*>(handle->data);
  InternalCallbackScope scope(data->isolate);
  Local<Context> context = data->isolate->GetCurrentContext();

  Local<Value> args[] = {
    ZERO_STRING(data->isolate, filename),
    Number::New(data->isolate, events),
  };

  Local<Function> cb = data->callback.Get(data->isolate);

  cb->Call(context, cb, 2, args).ToLocalChecked();
}

static void EventStart(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  String::Utf8Value path(isolate, args[0]);
  unsigned int flags = args[1]->Uint32Value();

  uv_fs_event_t* handle = new uv_fs_event_t;
  uv_fs_event_init(uv_default_loop(), handle);

  handle->data = new ZeroEvent(isolate, args[2]);

  uv_fs_event_start(handle, fs_event_cb, *path, flags);

  args.GetReturnValue().Set(External::New(isolate, handle));
}

static void EventStop(const FunctionCallbackInfo<Value>& args) {
  auto handle = reinterpret_cast<uv_fs_event_t*>(args[0].As<External>()->Value());

  delete reinterpret_cast<ZeroEvent*>(handle->data);

  uv_fs_event_stop(handle);
}

void Init(Local<Context> context, Local<Object> exports) {
  ZERO_SET_PROPERTY(context, exports, "open", Open);
  ZERO_SET_PROPERTY(context, exports, "close", Close);
  ZERO_SET_PROPERTY(context, exports, "stat", Stat);
  ZERO_SET_PROPERTY(context, exports, "fstat", FStat);
  ZERO_SET_PROPERTY(context, exports, "read", Read);
  ZERO_SET_PROPERTY(context, exports, "write", Write);
  ZERO_SET_PROPERTY(context, exports, "scandir", Scandir);
  ZERO_SET_PROPERTY(context, exports, "realpath", Realpath);
  ZERO_SET_PROPERTY(context, exports, "unlink", Unlink);
  ZERO_SET_PROPERTY(context, exports, "rmdir", Rmdir);
  ZERO_SET_PROPERTY(context, exports, "mkdir", Mkdir);
  ZERO_SET_PROPERTY(context, exports, "symlink", Symlink);
  ZERO_SET_PROPERTY(context, exports, "copy", Copy);
  ZERO_SET_PROPERTY(context, exports, "rename", Rename);
  ZERO_SET_PROPERTY(context, exports, "utime", Utime);
  ZERO_SET_PROPERTY(context, exports, "futime", FUtime);
  ZERO_SET_PROPERTY(context, exports, "eventStart", EventStart);
  ZERO_SET_PROPERTY(context, exports, "eventStop", EventStop);

#define V(n) ZERO_SET_PROPERTY(context, exports, #n, n);
  V(O_APPEND)
  V(O_CREAT)
  V(O_EXCL)
  V(O_RDONLY)
  V(O_RDWR)
  V(O_SYNC)
  V(O_TRUNC)
  V(O_WRONLY)
  V(S_IFBLK)
  V(S_IFCHR)
  V(S_IFDIR)
  V(S_IFIFO)
  V(S_IFLNK)
  V(S_IFMT)
  V(S_IFREG)
  V(S_IFSOCK)
  V(UV_FS_COPYFILE_EXCL)
  V(UV_DIRENT_UNKNOWN)
  V(UV_DIRENT_FILE)
  V(UV_DIRENT_DIR)
  V(UV_DIRENT_LINK)
  V(UV_DIRENT_FIFO)
  V(UV_DIRENT_SOCKET)
  V(UV_DIRENT_CHAR)
  V(UV_DIRENT_BLOCK)
#undef V
}

}  // namespace fs
}  // namespace zero

ZERO_REGISTER_INTERNAL(fs, zero::fs::Init);
