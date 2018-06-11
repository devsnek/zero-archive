#include <dlfcn.h>

#include "ffi.h"
#include "v8.h"
#include "edge.h"

using v8::Array;
using v8::Context;
using v8::External;
using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::Value;

namespace edge {
namespace ffi {

inline Local<Value> WrapPointer(Isolate* isolate, void* ptr) {
  return External::New(isolate, ptr);
}

inline void* UnwrapPointer(Local<Value> external) {
  return external.As<External>()->Value();
}

// abi, argc, ret type, [arg types]
void PrepCif(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();

  auto abi = (ffi_abi) args[0]->Uint32Value();
  uint32_t argc = args[1]->Uint32Value();
  auto rtype = (ffi_type*) UnwrapPointer(args[2]);

  ffi_type** atypes = nullptr;
  {
    Local<Array> a = args[3].As<Array>();
    uint32_t len = a->Length();
    for (uint32_t i = 0; i < len; i += 1) {
      atypes[i] = (ffi_type*) UnwrapPointer(a->Get(context, i).ToLocalChecked());
    }
  }

  ffi_cif* cif = new ffi_cif;

  ffi_status status = ffi_prep_cif(
      cif,
      abi,
      argc,
      rtype,
      atypes);

  args.GetReturnValue().Set(WrapPointer(isolate, cif));
}

// cif, fn, [args]
void Call(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();

  auto cif = (ffi_cif*) UnwrapPointer(args[0]);
  void* fn = UnwrapPointer(args[1]);
  void** fnargs = nullptr;
  {
    Local<Array> a = args[3].As<Array>();
    uint32_t len = a->Length();
    for (uint32_t i = 0; i < len; i += 1) {
      fnargs[i] = UnwrapPointer(a->Get(context, i).ToLocalChecked());
    }
  }

  void* res = nullptr;
#if __OBJC__ || __OBJC2__
  @try {
#endif

  ffi_call(cif, FFI_FN(fn), res, fnargs);

#if __OBJC__ || __OBJC2__
  } @catch (id ex) {
     // yeesh
  }
#endif

  args.GetReturnValue().Set(WrapPointer(isolate, res));
}

void Init(Local<Context> context, Local<Object> target) {
  Isolate* isolate = context->GetIsolate();

  EDGE_SET_PROPERTY(context, target, "prepCif", PrepCif);
  EDGE_SET_PROPERTY(context, target, "call", Call);

  EDGE_SET_PROPERTY(context, target, "dlopen", WrapPointer(isolate, (void*) dlopen));
  EDGE_SET_PROPERTY(context, target, "dlclose", WrapPointer(isolate, (void*) dlclose));
  EDGE_SET_PROPERTY(context, target, "dlsym", WrapPointer(isolate, (void*) dlsym));
  EDGE_SET_PROPERTY(context, target, "dlerror", WrapPointer(isolate, (void*) dlerror));

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
#define V(name, type) EDGE_SET_PROPERTY(context, types, name, WrapPointer(isolate, &type));
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
