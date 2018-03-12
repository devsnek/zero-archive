#include <uv.h>
#include <v8.h>
#include "ivan.h"

using namespace v8;

namespace ivan {
namespace uv {

struct fs_req_data {
  Isolate* isolate;
  void* data;
  Persistent<Function> function;
};

static int check_flags(const char* string) {
  if (strcmp(string, "r")   == 0) return O_RDONLY;
#ifdef O_SYNC
  if (strcmp(string, "rs")  == 0 ||
      strcmp(string, "sr")  == 0) return O_RDONLY | O_SYNC;
#endif
  if (strcmp(string, "r+")  == 0) return O_RDWR;
#ifdef O_SYNC
  if (strcmp(string, "rs+") == 0 ||
      strcmp(string, "sr+") == 0) return O_RDWR   | O_SYNC;
#endif
  if (strcmp(string, "w")   == 0) return O_TRUNC  | O_CREAT | O_WRONLY;
  if (strcmp(string, "wx")  == 0 ||
      strcmp(string, "xw")  == 0) return O_TRUNC  | O_CREAT | O_WRONLY | O_EXCL;
  if (strcmp(string, "w+")  == 0) return O_TRUNC  | O_CREAT | O_RDWR;
  if (strcmp(string, "wx+") == 0 ||
      strcmp(string, "xw+") == 0) return O_TRUNC  | O_CREAT | O_RDWR   | O_EXCL;
  if (strcmp(string, "a")   == 0) return O_APPEND | O_CREAT | O_WRONLY;
  if (strcmp(string, "ax")  == 0 ||
      strcmp(string, "xa")  == 0) return O_APPEND | O_CREAT | O_WRONLY | O_EXCL;
  if (strcmp(string, "a+")  == 0) return O_APPEND | O_CREAT | O_RDWR;
  if (strcmp(string, "ax+") == 0 ||
      strcmp(string, "xa+") == 0) return O_APPEND | O_CREAT | O_RDWR   | O_EXCL;
}

static void fs_callback(uv_fs_t* req) {
  fs_req_data* r = (fs_req_data*) req->data;
  Isolate* isolate = r->isolate;
  HandleScope handle_scope(isolate);
  Local<Context> context = r->isolate->GetCurrentContext();

  int argc = 2;
  Local<Value> argv[2] = {};

  if (req->result < 0) {
    argv[0] = Exception::Error(String::NewFromUtf8(isolate, uv_err_name(req->result)));
  } else {
    switch (req->fs_type) {
      case UV_FS_ACCESS:
        argv[1] = Boolean::New(isolate, req->result >= 0);
        break;

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
        argv[1] = True(isolate);
        break;

      case UV_FS_OPEN:
      case UV_FS_SENDFILE:
      case UV_FS_WRITE:
        argv[0] = Number::New(isolate, req->result);
        break;

      case UV_FS_STAT:
      case UV_FS_LSTAT:
      case UV_FS_FSTAT: {
        Local<Array> _a = Array::New(isolate, 15);
        argv[1] = _a;
        uv_stat_t t = req->statbuf;
#define V(i, name) \
        USE(_a->Set(context, i, Number::New(isolate, t.name)));
        V(0, st_dev);
        V(1, st_mode);
        V(2, st_nlink);
        V(3, st_uid);
        V(4, st_gid);
        V(5, st_rdev);
        V(6, st_ino);
        V(7, st_size);
        V(8, st_blksize);
        V(9, st_blocks);
        V(10, st_flags);
        V(11, st_gen);
#define VV(i, name) { \
          Local<Array> __a = Array::New(isolate, 2);                       \
          USE(__a->Set(context, 0, Number::New(isolate, t.name.tv_sec)));  \
          USE(__a->Set(context, 1, Number::New(isolate, t.name.tv_nsec))); \
          USE(_a->Set(context, i, __a));                                   \
        }
        VV(12, st_atim);
        VV(13, st_mtim);
        VV(14, st_ctim);
        VV(15, st_birthtim);
#undef VV
#undef V
        break;
      }

      case UV_FS_MKDTEMP:
        argv[1] = String::NewFromUtf8(isolate, req->path);
        break;


      case UV_FS_READLINK:
      case UV_FS_REALPATH:
        argv[1] = String::NewFromUtf8(isolate, (char*) req->ptr);
        break;

      case UV_FS_READ:
        argv[1] = String::NewFromUtf8(isolate, (const char*) r->data);
        break;

      case UV_FS_SCANDIR:
        // something data->req_ref
        break;

      case UV_FS_UNKNOWN:
      default:
        argv[0] = Exception::TypeError(String::NewFromUtf8(isolate, "Unknown FS Type: %d"));
        break;
    }
  }

  USE(r->function.Get(r->isolate)->Call(context, context->Global(), argc, argv));
  uv_fs_req_cleanup(req);
}

#define FS_CALL(func, req, ...) { \
  fs_req_data* r = (fs_req_data*) req->data; \
  int sync = r->function.IsEmpty();          \
  int ret = uv_fs_##func(uv_default_loop(), req, __VA_ARGS__, sync ? NULL : fs_callback); \
  if (sync) { \
    if (ret < 0) { \
      Local<Value> err = Exception::Error(String::NewFromUtf8(info.GetIsolate(), uv_err_name(req->result))); \
      info.GetIsolate()->ThrowException(err); \
      uv_fs_req_cleanup(req); \
      return; \
    } \
    info.GetReturnValue().Set(ret); \
    uv_fs_req_cleanup(req); \
  } \
}

void SetupCallback(uv_fs_t* req, int pos, const FunctionCallbackInfo<Value>& info, void* data) {
  Local<Value> m = info[pos];
  fs_req_data r = {info.GetIsolate(), data};
  if (m->IsFunction())
    r.function.Reset(info.GetIsolate(), m.As<Function>());
  req->data = &r;
}

static uv_buf_t ArrayBufferConvert(Isolate* isolate, Local<Uint8Array> array) {
  uv_buf_t buf;
  const char* data = "i hate c++";
  buf.base = (char*) &data[0];
  buf.len = strlen(data);
  return buf;
}

static void fs_close(const FunctionCallbackInfo<Value>& info) {
  uv_file file = info[0].As<Integer>()->Value();
  uv_fs_t* req = new uv_fs_t;
  SetupCallback(req, 1, info, NULL);
  FS_CALL(close, req, file);
}

static void fs_open(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();
  String::Utf8Value path(isolate, info[0].As<String>());
  String::Utf8Value cflags(isolate, info[1].As<String>());
  int flags = check_flags(*cflags);
  int mode = info[2].As<Integer>()->Value();
  uv_fs_t* req = new uv_fs_t;
  SetupCallback(req, 3, info, NULL);
  FS_CALL(open, req, *path, flags, mode);
}

static void fs_read(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();
  HandleScope handle_scope(isolate);

  uv_file file = info[0].As<Integer>()->Value();
  uint64_t len = info[1].As<Integer>()->Value();
  uint64_t offset = info[2].As<Integer>()->Value();
  uv_buf_t buf;
  int ref;
  uv_fs_t* req;
  char* data = nullptr;
  buf = uv_buf_init(data, len);
  ref = info[3].As<Integer>()->Value();
  req = new uv_fs_t;
  SetupCallback(req, 4, info, buf.base);
  FS_CALL(read, req, file, &buf, 1, offset);
}

/* int fd, u64 len, u64 offset */
static void fs_read_inline_sync(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();
  HandleScope handle_scope(isolate);

  uv_file file = info[0].As<Integer>()->Value();
  uint64_t len = info[1].As<Integer>()->Value();
  uint64_t offset = info[2].As<Integer>()->Value();

  uv_fs_t* req;
  char* data = nullptr;
  uv_buf_t buf = uv_buf_init(data, len);

  req = new uv_fs_t;

  int res = uv_fs_read(uv_default_loop(), req, file, &buf, 1, offset, NULL);

  info.GetReturnValue().Set(String::NewFromUtf8(isolate, (const char*) data));
}

static void fs_unlink(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();
  String::Utf8Value path(isolate, info[0].As<String>());
  uv_fs_t* req = new uv_fs_t;
  SetupCallback(req, 1, info, NULL);
  FS_CALL(unlink, req, *path);
}

static void fs_write(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();
  uv_file file = info[0].As<Integer>()->Value();
  uv_fs_t* req = new uv_fs_t;
  uv_buf_t buf = ArrayBufferConvert(isolate, info[1].As<Uint8Array>());
  int count = 0;
  uint64_t offset = info[2].As<Integer>()->Value();
  SetupCallback(req, 3, info, NULL);
  FS_CALL(write, req, file, &buf, count, offset);
}

static void fs_fstat(const FunctionCallbackInfo<Value>& info) {
  uv_file file = info[0].As<Integer>()->Value();
  uv_fs_t* req = new uv_fs_t;
  SetupCallback(req, 1, info, NULL);
  FS_CALL(fstat, req, file);
}

static void Init(Isolate* isolate, Local<Object> target) {
  IVAN_INTERNAL_EXPOSE(target, fs_close);
  IVAN_INTERNAL_EXPOSE(target, fs_open);
  IVAN_INTERNAL_EXPOSE(target, fs_read);
  IVAN_INTERNAL_EXPOSE(target, fs_unlink);
  IVAN_INTERNAL_EXPOSE(target, fs_write);
  IVAN_INTERNAL_EXPOSE(target, fs_fstat);

  IVAN_INTERNAL_EXPOSE(target, fs_read_inline_sync);
}

} // namespace uv
} // namespace ivan

IVAN_REGISTER_INTERNAL(uv, ivan::uv::Init);

