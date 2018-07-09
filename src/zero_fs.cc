#include <uv.h>
#include <string>

#include "v8.h"
#include "zero.h"

using v8::BigInt;
using v8::Context;
using v8::FunctionCallbackInfo;
using v8::Integer;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::Persistent;
using v8::Promise;
using v8::String;
using v8::Value;

namespace zero {
namespace fs {

class zeroReq {
 public:
  explicit zeroReq(Isolate* isolate,
                   const char* type,
                   bool sync = false,
                   void* data = nullptr) :
    isolate_(isolate),
    type_(const_cast<char*>(type)),
    sync_(sync),
    data_(data) {}

  ~zeroReq() {
    isolate_ = nullptr;
    resolver_.Reset();
  }

  inline Isolate* isolate() const { return isolate_; }
  inline char* type() const { return type_; }
  inline bool sync() const { return sync_; }
  inline void* data() const { return data_; }
  inline void resolver(Local<Promise::Resolver> r) {
    resolver_.Reset(isolate_, r);
  }
  inline Local<Promise::Resolver> resolver() const {
    return resolver_.Get(isolate_);
  }

 private:
  Isolate* isolate_;
  char* type_;
  bool sync_;
  void* data_;
  Persistent<Promise::Resolver> resolver_;
};

Local<Value> normalize_req(Isolate* isolate, uv_fs_t* req) {
  if (req->fs_type == UV_FS_ACCESS)
    return v8::Boolean::New(isolate, req->result >= 0);

  zeroReq* data = reinterpret_cast<zeroReq*>(req->data);
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
      Local<Object> table = Object::New(isolate);
#define V(name) \
      USE(table->Set(context, ZERO_STRING(isolate, #name), v8::Integer::New(isolate, s->st_##name)))
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
      USE(table->Set(context, ZERO_STRING(isolate, #name), v8::Integer::New(isolate,              \
                     (int64_t) (s->st_##name.tv_sec * 1000000000) + s->st_##name.tv_nsec)));
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
      return v8::String::NewFromUtf8(isolate, req->path);

    case UV_FS_READLINK:
    case UV_FS_REALPATH:
      return v8::String::NewFromUtf8(isolate, reinterpret_cast<char*>(req->ptr));

    case UV_FS_READ:
      return v8::Uint8Array::New(
          v8::ArrayBuffer::New(isolate, reinterpret_cast<char*>(data->data()), req->result),
          0, req->result);

    case UV_FS_SCANDIR:
      // Expose the userdata for the request.
      // lua_rawgeti(L, LUA_REGISTRYINDEX, data->req_ref);
      // return 1;
      return v8::Integer::New(isolate, -1);

    default:
      return v8::Exception::Error(ZERO_STRING(isolate, "UNKNOWN FS TYPE"));
  }
}

const char* makeErrMessage(const char* type, int result) {
  std::string e = type;
  e += ": ";
  e += uv_strerror(result);
  return e.c_str();
}

void fs_cb(uv_fs_t* req) {
  zeroReq* data = reinterpret_cast<zeroReq*>(req->data);
  Isolate* isolate = data->isolate();
  Local<Context> context = isolate->GetCurrentContext();
  InternalCallbackScope callback_scope(isolate);
  if (req->fs_type != UV_FS_ACCESS && req->result < 0) {
    Local<Value> e = v8::Exception::Error(
        ZERO_STRING(isolate, makeErrMessage(data->type(), req->result)));
    USE(data->resolver()->Reject(context, e));
  } else {
    Local<Value> v = normalize_req(isolate, req);
    if (v->IsNativeError())
      USE(data->resolver()->Reject(context, v));
    else
      USE(data->resolver()->Resolve(context, v));
  }
  delete data;
  delete req;
}

#define FS_CALL(args, func, req, ...) {                                       \
  zeroReq* data = reinterpret_cast<zeroReq*>(req->data);                      \
  int ret = uv_fs_##func(uv_default_loop(), req, __VA_ARGS__, data->sync() ? NULL : fs_cb); \
  Isolate* isolate = args.GetIsolate();                                       \
  if (req->fs_type != UV_FS_ACCESS && ret < 0) {                              \
    ZERO_THROW_EXCEPTION(isolate, makeErrMessage(data->type(), req->result)); \
    delete data;                                                              \
    delete req;                                                               \
  } else if (data->sync()) {                                                  \
    Local<Value> v = normalize_req(isolate, req);                             \
    if (v->IsNativeError())                                                   \
      isolate->ThrowException(v);                                             \
    else                                                                      \
      args.GetReturnValue().Set(v);                                           \
    delete data;                                                              \
    delete req;                                                               \
  } else {                                                                    \
    Local<Promise::Resolver> resolver = Promise::Resolver::New(isolate);      \
    data->resolver(resolver);                                                 \
    args.GetReturnValue().Set(resolver->GetPromise());                        \
  }                                                                           \
}

#define FS_INIT(...)                                                          \
  zeroReq* data = new zeroReq(__VA_ARGS__);                                   \
  uv_fs_t* req = new uv_fs_t;                                                 \
  req->data = data;

static void Open(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  String::Utf8Value path(isolate, args[0]);
  int mode = args[1]->Int32Value();

  FS_INIT(isolate, "open", args[2]->IsFalse());
  FS_CALL(args, open, req, *path, mode, 0);
}

static void Close(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  uv_file file = args[0]->Int32Value();

  FS_INIT(isolate, "close", args[1]->IsFalse());
  FS_CALL(args, close, req, file);
}

static void Stat(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  String::Utf8Value path(isolate, args[0]);

  FS_INIT(isolate, "stat", args[1]->IsFalse());
  FS_CALL(args, stat, req, *path);
}

static void FStat(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  uv_file file = args[0]->Int32Value();

  FS_INIT(isolate, "fstat", args[1]->IsFalse());
  FS_CALL(args, fstat, req, file);
}

static void Read(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  uv_file file = args[0]->Int32Value();
  int64_t len = args[1]->IntegerValue();
  int64_t offset = args[2]->Int32Value();

  char* buffer = reinterpret_cast<char*>(malloc(len));

  uv_buf_t buf = uv_buf_init(buffer, len);

  FS_INIT(isolate, "read", args[3]->IsFalse(), buf.base);
  FS_CALL(args, read, req, file, &buf, 1, offset);
}

void Init(Local<Context> context, Local<Object> exports) {
  ZERO_SET_PROPERTY(context, exports, "open", Open);
  ZERO_SET_PROPERTY(context, exports, "close", Close);
  ZERO_SET_PROPERTY(context, exports, "stat", Stat);
  ZERO_SET_PROPERTY(context, exports, "fstat", FStat);
  ZERO_SET_PROPERTY(context, exports, "read", Read);

#define V(n) ZERO_SET_PROPERTY(context, exports, #n, n);
  V(O_RDONLY);
  V(O_WRONLY);
  V(O_RDWR);
  V(O_APPEND);
#ifdef O_SYNC
  V(O_SYNC);
#endif
  V(O_CREAT);
  V(O_TRUNC);
  V(O_EXCL);
#undef V
}

}  // namespace fs
}  // namespace zero

ZERO_REGISTER_INTERNAL(fs, zero::fs::Init);
