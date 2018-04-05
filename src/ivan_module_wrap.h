#ifndef SRC_IVAN_MODULE_WRAP_H_
#define SRC_IVAN_MODULE_WRAP_H_

#include <unordered_map>
#include <string>
#include <vector>
#include "base_object-inl.h"
#include "persistent.h"
#include "ivan.h"

namespace ivan {
namespace loader {

class ModuleWrap : public BaseObject {
 public:
  enum SourceType { kScript, kModule };

  struct ContextModuleData {
    std::unordered_map<int, ModuleWrap*> id_to_module_wrap_map;
    std::unordered_multimap<int, ModuleWrap*> module_to_module_wrap_map;
    std::unordered_map<int, void*> id_to_script_wrap_map;
  };

  static void Initialize(v8::Isolate*, v8::Local<v8::Object>);
  static void HostInitializeImportMetaObjectCallback(
      v8::Local<v8::Context> context,
      v8::Local<v8::Module> module,
      v8::Local<v8::Object> meta);
  static ModuleWrap* GetFromID(v8::Local<v8::Context>, int);
  static ContextModuleData* GetModuleData(v8::Local<v8::Context>);

  int id;

 private:
  ModuleWrap(v8::Isolate* isolate,
             v8::Local<v8::Object> object,
             v8::Local<v8::Module> module,
             v8::Local<v8::String> url);
  ~ModuleWrap();

  static void New(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void Link(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void Instantiate(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void Evaluate(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void Namespace(const v8::FunctionCallbackInfo<v8::Value>& args);
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
  static ModuleWrap* GetFromModule(
      v8::Local<v8::Context>,
      v8::Local<v8::Module>);

  inline static void SetImportModuleDynamicallyCallback(
      v8::Local<v8::Context> context, v8::Local<v8::Function> callback) {
    context->SetEmbedderData(EmbedderKeys::kImportModuleDynamicallyCallback, callback);
  }
  inline static v8::Local<v8::Function> GetImportModuleDynamicallyCallback(
      v8::Local<v8::Context> context) {
    return context->GetEmbedderData(EmbedderKeys::kImportModuleDynamicallyCallback)
        .As<v8::Function>();
  }
  inline static void SetInitializeImportMetaObjectCallback(
      v8::Local<v8::Context> context, v8::Local<v8::Function> callback) {
    context->SetEmbedderData(EmbedderKeys::kInitializeImportMetaObjectCallback, callback);
  }
  inline static v8::Local<v8::Function> GetInitializeImportMetaObjectCallback(
      v8::Local<v8::Context> context) {
    return context->GetEmbedderData(EmbedderKeys::kInitializeImportMetaObjectCallback)
        .As<v8::Function>();
  }

  static int Identity_;

  Persistent<v8::Module> module_;
  Persistent<v8::String> url_;
  bool linked_ = false;
  std::unordered_map<std::string, Persistent<v8::Promise>> resolve_cache_;
  Persistent<v8::Context> context_;
};

}  // namespace loader
}  // namespace ivan

#endif  // SRC_IVAN_MODULE_WRAP_H_
