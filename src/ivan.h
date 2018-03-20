#ifndef _SRC_IVAN_H
#define _SRC_IVAN_H

#include <v8.h>
#include <type_traits> // std::remove_reference

#ifdef __GNUC__
#define LIKELY(expr) __builtin_expect(!!(expr), 1)
#define UNLIKELY(expr) __builtin_expect(!!(expr), 0)
#define PRETTY_FUNCTION_NAME __PRETTY_FUNCTION__
#else
#define LIKELY(expr) expr
#define UNLIKELY(expr) expr
#define PRETTY_FUNCTION_NAME ""
#endif

#define STRINGIFY_(x) #x
#define STRINGIFY(x) STRINGIFY_(x)

#define CHECK(expr)                                             \
  do {                                                          \
    if (UNLIKELY(!(expr))) {                                    \
      fprintf(stderr, "%s:%s Assertion `%s' failed.\n",         \
          __FILE__, STRINGIFY(__LINE__), #expr);                \
    }                                                           \
  } while (0)

#define CHECK_EQ(a, b) CHECK((a) == (b))
#define CHECK_GE(a, b) CHECK((a) >= (b))
#define CHECK_GT(a, b) CHECK((a) > (b))
#define CHECK_LE(a, b) CHECK((a) <= (b))
#define CHECK_LT(a, b) CHECK((a) < (b))
#define CHECK_NE(a, b) CHECK((a) != (b))

template <typename T> inline void USE(T&&) {};

template <typename T, size_t N>
constexpr size_t arraysize(const T(&)[N]) { return N; }

#define IVAN_REGISTER_INTERNAL(name, fn) \
  static ivan::ivan_module _module = {#name, fn}; \
  void _register_ ## name() {                     \
    ivan_module_register(&_module);               \
  }

#define IVAN_INTERNAL_EXPOSE(target, name) \
  USE(target->Set(isolate->GetCurrentContext(), String::NewFromUtf8(isolate, #name), FunctionTemplate::New(isolate, name)->GetFunction()))

#define ASSIGN_OR_RETURN_UNWRAP(ptr, obj, ...)                                \
  do {                                                                        \
    *ptr =                                                                    \
        Unwrap<typename std::remove_reference<decltype(**ptr)>::type>(obj);   \
    if (*ptr == nullptr)                                                      \
      return __VA_ARGS__;                                                     \
  } while (0)

namespace ivan {

typedef void (*IvanModuleCallback)(v8::Isolate*, v8::Local<v8::Object>);

struct ivan_module {
  const char* im_name;
  IvanModuleCallback im_function;
  struct ivan_module* im_link;
};

void ivan_module_register(void*);

enum EmbedderKeys {
  BindingCache
};

} // namespace ivan

#endif // _SRC_IVAN_H
