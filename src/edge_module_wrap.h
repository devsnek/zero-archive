#ifndef SRC_EDGE_MODULE_WRAP_H_
#define SRC_EDGE_MODULE_WRAP_H_

#include <string>
#include <vector>
#include <unordered_map>  // std::unordered_map
#include "base_object-inl.h"

namespace edge {
namespace loader {

class ModuleWrap : public BaseObject {
 public:
  static void Initialize(v8::Local<v8::Context> context,
                         v8::Local<v8::Object> target);
  static void HostInitializeImportMetaObjectCallback(
      v8::Local<v8::Context> context,
      v8::Local<v8::Module> module,
      v8::Local<v8::Object> meta);
  static ModuleWrap* GetFromID(int);

  inline int GetID() { return id_; }

 private:
  ModuleWrap(v8::Isolate* isolate,
             v8::Local<v8::Object> object,
             v8::Local<v8::Module> module);
  ~ModuleWrap();

  static void New(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void Link(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void Instantiate(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void Evaluate(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void GetNamespace(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void GetStatus(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void GetError(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void GetStaticDependencySpecifiers(
      const v8::FunctionCallbackInfo<v8::Value>& args);

  static void Resolve(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void SetImportModuleDynamicallyCallback(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void SetInitializeImportMetaObjectCallback(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static v8::MaybeLocal<v8::Module> ResolveCallback(
      v8::Local<v8::Context> context,
      v8::Local<v8::String> specifier,
      v8::Local<v8::Module> referrer);
  static v8::MaybeLocal<v8::Promise> ImportModuleDynamically(
      v8::Local<v8::Context> context,
      v8::Local<v8::ScriptOrModule> referrer,
      v8::Local<v8::String> specifier);
  static ModuleWrap* GetFromModule(v8::Local<v8::Module>);

  static v8::Persistent<v8::Function> host_initialize_import_meta_object_callback;
  static v8::Persistent<v8::Function> host_import_module_dynamically_callback;

  static int Identity_;

  int id_;
  v8::Persistent<v8::Module> module_;
  bool linked_ = false;
  std::unordered_map<std::string, v8::Persistent<v8::Promise>> resolve_cache_;
  v8::Persistent<v8::Context> context_;
};

}  // namespace loader
}  // namespace edge

#endif  // SRC_EDGE_MODULE_WRAP_H_
