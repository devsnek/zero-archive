#ifndef _IVAN_SRC_IVAN_MODULE_WRAP_H
#define _IVAN_SRC_IVAN_MODULE_WRAP_H

#include <v8.h>

namespace ivan {

class ModuleWrap {
 public:
  ModuleWrap(v8::Isolate*, const char*, v8::Local<v8::String>);
  ~ModuleWrap();
  void Instantiate();
  v8::Local<v8::Value> Evaluate();
  v8::Local<v8::Value> Result();

 private:
  static v8::MaybeLocal<v8::Module> ResolveCallback(
      v8::Local<v8::Context>, v8::Local<v8::String>, v8::Local<v8::Module>);

  v8::Isolate* isolate_;
  v8::Persistent<v8::Module> module_;
  v8::Persistent<v8::Value> result_;
};

} // namespace ivan

#endif // _IVAN_SRC_IVAN_MODULE_WRAP_H
