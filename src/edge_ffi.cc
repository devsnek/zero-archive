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

Local<Value> WrapPointer(Isolate* isolate, char* ptr, size_t size = 0) {
  return Uint8Array::New(ArrayBuffer::New(isolate, ptr, size), 0, size);
}

char* BufferData(Local<Value> val) {
  CHECK(val->IsArrayBufferView());
  Local<ArrayBufferView> ui = val.As<ArrayBufferView>();
  ArrayBuffer::Contents ab_c = ui->Buffer()->GetContents();
  return static_cast<char*>(ab_c.Data()) + ui->ByteOffset();
}

void WritePointer(const FunctionCallbackInfo<Value>& args) {
  Local<Uint8Array> buf = args[0].As<Uint8Array>();
  int32_t offset = args[1]->Int32Value();
  Local<Value> input = args[2];

  char* ptr = ((char*) buf->Buffer()->GetContents().Data()) + offset;

  if (input->IsNull()) {
    *reinterpret_cast<char**>(ptr) = NULL;
  } else {
    char *input_ptr = BufferData(input);
    *reinterpret_cast<char**>(ptr) = input_ptr;
  }
}

void ReadPointer(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  Local<Uint8Array> buf = args[0].As<Uint8Array>();
  int32_t offset = args[1]->Int32Value();

  char* ptr = ((char*) buf->Buffer()->GetContents().Data()) + offset;

  if (ptr != NULL) {
    size_t size = args[2]->Uint32Value();
    char* val = *reinterpret_cast<char**>(ptr);
    args.GetReturnValue().Set(WrapPointer(isolate, val, size));
  }
}

void ReadCString(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  Local<Uint8Array> buf = args[0].As<Uint8Array>();
  int32_t offset = args[1]->Int32Value();

  char* ptr = ((char*) buf->Buffer()->GetContents().Data()) + offset;

  args.GetReturnValue().Set(v8::String::NewFromUtf8(isolate, ptr));
}

// cif, nargs, rtype, atypes
void PrepCif(const FunctionCallbackInfo<Value>& args) {
  auto cif = reinterpret_cast<ffi_cif*>(BufferData(args[0]));
  unsigned int nargs = args[1]->Uint32Value();
  auto rtype = reinterpret_cast<ffi_type*>(BufferData(args[2]));
  auto atypes = reinterpret_cast<ffi_type**>(BufferData(args[3]));

  ffi_prep_cif(cif, FFI_DEFAULT_ABI, nargs, rtype, atypes);
}

// cif, fnptr, rvalue, avalue
void Call(const FunctionCallbackInfo<Value>& args) {
  auto cif = reinterpret_cast<ffi_cif*>(BufferData(args[0]));
  auto fn = reinterpret_cast<void (*)(void)>(BufferData(args[1]));
  auto rvalue = reinterpret_cast<void*>(BufferData(args[2]));
  auto avalue = reinterpret_cast<void**>(BufferData(args[3]));

  ffi_call(cif, fn, rvalue, avalue);
}

void Init(Local<Context> context, Local<Object> target) {
  Isolate* isolate = context->GetIsolate();

  EDGE_SET_PROPERTY(context, target, "writePointer", WritePointer);
  EDGE_SET_PROPERTY(context, target, "readPointer", ReadPointer);
  EDGE_SET_PROPERTY(context, target, "readCString", ReadCString);
  EDGE_SET_PROPERTY(context, target, "ffi_prep_cif", PrepCif);
  EDGE_SET_PROPERTY(context, target, "ffi_call", Call);

#define V(fn) \
  EDGE_SET_PROPERTY(context, target, #fn, WrapPointer(isolate, reinterpret_cast<char*>(fn)));

  V(dlopen)
  V(dlclose)
  V(dlsym)
  V(dlerror)
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

  EDGE_SET_PROPERTY(context, target, "ffi_arg_size", sizeof(ffi_arg));
  EDGE_SET_PROPERTY(context, target, "ffi_sarg_size", sizeof(ffi_sarg));
  EDGE_SET_PROPERTY(context, target, "ffi_type_size", sizeof(ffi_type));
  EDGE_SET_PROPERTY(context, target, "ffi_cif_size", sizeof(ffi_cif));

  Local<Object> types = v8::Object::New(isolate);
  Local<Object> sizes = v8::Object::New(isolate);
  EDGE_SET_PROPERTY(context, target, "types", types);
  EDGE_SET_PROPERTY(context, target, "sizeof", sizes);

  // void special case
  EDGE_SET_PROPERTY(context, types, "void", WrapPointer(isolate, (char*) &ffi_type_void));
  EDGE_SET_PROPERTY(context, sizes, "void", 0);

#define V(name, type, ffi_type) \
  EDGE_SET_PROPERTY(context, types, name, WrapPointer(isolate, (char*) &ffi_type)); \
  EDGE_SET_PROPERTY(context, sizes, name, sizeof(type));

  V("uint8", uint8_t, ffi_type_uint8)
  V("int8", int8_t, ffi_type_sint8)
  V("uint16", uint16_t, ffi_type_uint16)
  V("int16", int16_t, ffi_type_sint16)
  V("uint32", uint32_t, ffi_type_uint32)
  V("int32", int32_t, ffi_type_sint32)
  V("uint64", uint64_t, ffi_type_uint64)
  V("int64", int64_t, ffi_type_sint64)
  V("uchar", unsigned char, ffi_type_uchar)
  V("char", char, ffi_type_schar)
  V("ushort", unsigned short, ffi_type_ushort)
  V("short", short, ffi_type_sshort)
  V("uint", unsigned int, ffi_type_uint)
  V("int", int, ffi_type_sint)
  V("float", float, ffi_type_float)
  V("double", double, ffi_type_double)
  V("ulonglong", unsigned long long, ffi_type_ulong)
  V("longlong", long long, ffi_type_slong)
  V("pointer", char*, ffi_type_pointer)
  V("cstring", char*, ffi_type_pointer)
#undef V
}

}  // namespace ffi
}  // namespace edge

EDGE_REGISTER_INTERNAL(ffi, edge::ffi::Init);
