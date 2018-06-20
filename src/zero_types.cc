#include "v8.h"
#include "zero.h"

using v8::Context;
using v8::FunctionCallbackInfo;
using v8::Local;
using v8::Object;
using v8::Value;

namespace zero {
namespace types {

#define VALUE_METHOD_MAP(V)                                                   \
  V(External)                                                                 \
  V(Date)                                                                     \
  V(ArgumentsObject)                                                          \
  V(BooleanObject)                                                            \
  V(NumberObject)                                                             \
  V(StringObject)                                                             \
  V(SymbolObject)                                                             \
  V(NativeError)                                                              \
  V(RegExp)                                                                   \
  V(AsyncFunction)                                                            \
  V(GeneratorFunction)                                                        \
  V(GeneratorObject)                                                          \
  V(Promise)                                                                  \
  V(Map)                                                                      \
  V(Set)                                                                      \
  V(MapIterator)                                                              \
  V(SetIterator)                                                              \
  V(WeakMap)                                                                  \
  V(WeakSet)                                                                  \
  V(ArrayBuffer)                                                              \
  V(DataView)                                                                 \
  V(SharedArrayBuffer)                                                        \
  V(Proxy)                                                                    \
  V(WebAssemblyCompiledModule)                                                \
  V(ModuleNamespaceObject)                                                    \

#define V(type) \
  static void Is##type(const FunctionCallbackInfo<Value>& args) {             \
    args.GetReturnValue().Set(args[0]->Is##type());                           \
  }

  VALUE_METHOD_MAP(V)
#undef V

void Init(Local<Context> context, Local<Object> target) {
#define V(type) \
  ZERO_SET_PROPERTY(context, target, "is"#type, Is##type);
  VALUE_METHOD_MAP(V)
#undef V
}

}  // namespace types
}  // namespace zero

ZERO_REGISTER_INTERNAL(types, zero::types::Init);
