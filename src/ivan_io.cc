#include <v8.h>
#include <uv.h>
#include "ivan.h"

using v8::Context;
using v8::FunctionCallbackInfo;
using v8::Integer;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::Promise;
using v8::String;
using v8::Value;

namespace ivan {
namespace io {

struct ivan_req_t {
  Isolate* isolate;
  bool sync;
  void* data;
  v8::Persistent<Promise::Resolver> resolver;
};

Local<Value> normalize_req(Isolate* isolate, uv_fs_t* req) {
  if (req->fs_type == UV_FS_ACCESS)
    return v8::Boolean::New(isolate, req->result >= 0);

  ivan_req_t* data = reinterpret_cast<ivan_req_t*>(req->data);
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
      USE(table->Set(context, IVAN_STRING(isolate, #name), v8::Integer::New(isolate, s->st_##name)))
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
      // atim mtim ctim birthtim
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
        USE(table->Set(context, IVAN_STRING(isolate, "type"), IVAN_STRING(isolate, type)));

      return table;
    }

    case UV_FS_MKDTEMP:
      return v8::String::NewFromUtf8(isolate, req->path);

    case UV_FS_READLINK:
    case UV_FS_REALPATH:
      return v8::String::NewFromUtf8(isolate, reinterpret_cast<char*>(req->ptr));

    case UV_FS_READ:
      return v8::String::NewFromUtf8(isolate, (const char*) data->data,
          String::NewStringType::kNormalString, req->result);

    case UV_FS_SCANDIR:
      // Expose the userdata for the request.
      // lua_rawgeti(L, LUA_REGISTRYINDEX, data->req_ref);
      // return 1;
      return v8::Integer::New(isolate, -1);

    default:
      // lua_pushnil(L);
      // lua_pushfstring(L, "UNKNOWN FS TYPE %d\n", req->fs_type);
      // return 2;
      return v8::Integer::New(isolate, -1);
  }
}

void fs_cb(uv_fs_t* req) {
  ivan_req_t* data = reinterpret_cast<ivan_req_t*>(req->data);
  Isolate* isolate = data->isolate;
  Local<Context> context = isolate->GetCurrentContext();
  if (req->fs_type != UV_FS_ACCESS && req->result < 0) {
    Local<Value> e = v8::Exception::Error(IVAN_STRING(isolate, uv_strerror(req->result)));
    USE(data->resolver.Get(isolate)->Reject(context, e));
  } else {
    USE(data->resolver.Get(isolate)->Resolve(context, normalize_req(isolate, req)));
  }
  isolate->RunMicrotasks();
}

#define FS_CALL(args, func, req, ...) {                                       \
  ivan_req_t* data = reinterpret_cast<ivan_req_t*>(req->data);                \
  int ret = uv_fs_##func(uv_default_loop(), req, __VA_ARGS__, data->sync ? NULL : fs_cb); \
  Isolate* isolate = args.GetIsolate();                                       \
  if (req->fs_type != UV_FS_ACCESS && ret < 0) {                              \
    IVAN_THROW_EXCEPTION(isolate, uv_strerror(req->result));                  \
  } else if (data->sync) {                                                    \
    args.GetReturnValue().Set(normalize_req(isolate, req));                   \
  } else {                                                                    \
    Local<Promise::Resolver> resolver = Promise::Resolver::New(isolate);      \
    data->resolver.Reset(isolate, resolver);                                  \
    args.GetReturnValue().Set(resolver->GetPromise());                        \
  }                                                                           \
}


static void Open(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  String::Utf8Value path(isolate, args[0].As<String>());

  ivan_req_t* data = new ivan_req_t{isolate, args[1]->IsFalse()};

  uv_fs_t* req = new uv_fs_t;
  req->data = data;

  FS_CALL(args, open, req, *path, O_RDONLY, 0);
}

static void Close(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  uv_file file = args[0].As<Integer>()->Value();

  ivan_req_t* data = new ivan_req_t{isolate, args[1]->IsFalse()};

  uv_fs_t* req = new uv_fs_t;
  req->data = data;
  FS_CALL(args, close, req, file);
}

static void FStat(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  uv_file file = args[0].As<Integer>()->Value();


  ivan_req_t* data = new ivan_req_t{isolate, args[1]->IsFalse()};

  uv_fs_t* req = new uv_fs_t;
  req->data = data;
  FS_CALL(args, fstat, req, file);
}

static void Read(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  uv_file file = args[0].As<Integer>()->Value();
  int64_t len = args[1].As<Integer>()->Value();
  int64_t offset = args[2].As<Integer>()->Value();

  char* buffer = reinterpret_cast<char*>(malloc(len));

  uv_buf_t buf = uv_buf_init(buffer, len);

  ivan_req_t* data = new ivan_req_t{isolate, args[3]->IsFalse(), buf.base};

  uv_fs_t* req = new uv_fs_t;
  req->data = data;

  FS_CALL(args, read, req, file, &buf, 1, offset);
}

void Init(Isolate* isolate, Local<Object> exports) {
  IVAN_SET_METHOD(isolate, exports, "open", Open);
  IVAN_SET_METHOD(isolate, exports, "close", Close);
  IVAN_SET_METHOD(isolate, exports, "fstat", FStat);
  IVAN_SET_METHOD(isolate, exports, "read", Read);
}

}  // namespace io
}  // namespace ivan

IVAN_REGISTER_INTERNAL(io, ivan::io::Init);
