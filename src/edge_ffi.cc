#include <dlfcn.h>

#include "ffi.h"
#include "v8.h"
#include "edge.h"
#include "base_object-inl.h"

using v8::Array;
using v8::ArrayBuffer;
using v8::ArrayBufferView;
using v8::Context;
using v8::External;
using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::Uint8Array;
using v8::Value;

namespace edge {
namespace ffi {

Local<Value> WrapPointer(Isolate* isolate, char* ptr) {
  return Uint8Array::New(ArrayBuffer::New(isolate, ptr, 0), 0, 0);
}

char* BufferData(Local<Value> val) {
  CHECK(val->IsArrayBufferView());
  Local<ArrayBufferView> ui = val.As<ArrayBufferView>();
  ArrayBuffer::Contents ab_c = ui->Buffer()->GetContents();
  return static_cast<char*>(ab_c.Data()) + ui->ByteOffset();
}

void WritePointer(const FunctionCallbackInfo<Value>& args) {
  Local<Uint8Array> buf = args[0].As<Uint8Array>();
  Local<Value> input = args[1];
  int32_t offset = args[2]->Int32Value();

  char* ptr = ((char*) buf->Buffer()->GetContents().Data()) + offset;

  if (input->IsNull()) {
    *reinterpret_cast<char**>(ptr) = NULL;
  } else {
    char *input_ptr = BufferData(input);
    *reinterpret_cast<char**>(ptr) = input_ptr;
  }
}

void Init(Local<Context> context, Local<Object> target) {
  Isolate* isolate = context->GetIsolate();

  EDGE_SET_PROPERTY(context, target, "writePointer", WritePointer);

#define V(fn) \
  EDGE_SET_PROPERTY(context, target, #fn, WrapPointer(isolate, reinterpret_cast<char*>(fn)));

  V(dlopen)
  V(dlclose)
  V(dlsym)
  V(dlerror)
  V(puts);
#undef V

#define V(enum) EDGE_SET_PROPERTY(context, target, #enum, enum);

  V(FFI_OK)
  V(FFI_BAD_TYPEDEF)
  V(FFI_BAD_ABI)

  V(FFI_DEFAULT_ABI)
  V(FFI_FIRST_ABI)
  V(FFI_LAST_ABI)

#ifdef __arm__
  V(FFI_SYSV)
  V(FFI_VFP)
#elif defined(X86_WIN32)
  V(FFI_SYSV)
  V(FFI_STDCALL)
  V(FFI_THISCALL)
  V(FFI_FASTCALL)
  V(FFI_MS_CDEL)
#elif defined(X86_WIN64)
  V(FFI_WIN64)
#else
  V(FFI_SYSV)
  V(FFI_UNIX64)
#endif

#ifdef RTLD_LAZY
  V(RTLD_LAZY);
#endif
#ifdef RTLD_NOW
  V(RTLD_NOW);
#endif
#ifdef RTLD_LOCAL
  V(RTLD_LOCAL);
#endif
#ifdef RTLD_GLOBAL
  V(RTLD_GLOBAL);
#endif
#ifdef RTLD_NOLOAD
  V(RTLD_NOLOAD);
#endif
#ifdef RTLD_NODELETE
  V(RTLD_NODELETE);
#endif
#ifdef RTLD_FIRST
  V(RTLD_FIRST);
#endif

#undef V

  Local<Object> types = v8::Object::New(isolate);
  EDGE_SET_PROPERTY(context, target, "types", types);
#define V(name, type) \
  EDGE_SET_PROPERTY(context, types, name, WrapPointer(isolate, (char*) &type));

  V("void", ffi_type_void)
  V("uint8", ffi_type_uint8)
  V("int8", ffi_type_sint8)
  V("uint16", ffi_type_uint16)
  V("int16", ffi_type_sint16)
  V("uint32", ffi_type_uint32)
  V("int32", ffi_type_sint32)
  V("uint64", ffi_type_uint64)
  V("int64", ffi_type_sint64)
  V("uchar", ffi_type_uchar)
  V("char", ffi_type_schar)
  V("ushort", ffi_type_ushort)
  V("short", ffi_type_sshort)
  V("uint", ffi_type_uint)
  V("int", ffi_type_sint)
  V("float", ffi_type_float)
  V("double", ffi_type_double)
  V("pointer", ffi_type_pointer)
  V("ulonglong", ffi_type_ulong)
  V("longlong", ffi_type_slong)
#undef V
}

}  // namespace ffi
}  // namespace edge

EDGE_REGISTER_INTERNAL(ffi, edge::ffi::Init);
