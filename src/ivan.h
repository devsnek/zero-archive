#ifndef SRC_IVAN_H_
#define SRC_IVAN_H_

#include <v8.h>
#include <type_traits>  // std::remove_reference

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

template <typename TypeName>
void Wrap(v8::Local<v8::Object> object, TypeName* pointer) {
  CHECK_EQ(false, object.IsEmpty());
  CHECK_GT(object->InternalFieldCount(), 0);
  object->SetAlignedPointerInInternalField(0, pointer);
}

template <typename TypeName>
TypeName* Unwrap(v8::Local<v8::Object> object) {
  CHECK_EQ(false, object.IsEmpty());
  CHECK_GT(object->InternalFieldCount(), 0);
  void* pointer = object->GetAlignedPointerFromInternalField(0);
  return static_cast<TypeName*>(pointer);
}

#define UNREACHABLE() abort()

#define DISALLOW_COPY_AND_ASSIGN(TypeName)                                    \
  void operator=(const TypeName&) = delete;                                   \
  void operator=(TypeName&&) = delete;                                        \
  TypeName(const TypeName&) = delete;                                         \
  TypeName(TypeName&&) = delete

#define IVAN_STRING(isolate, s) v8::String::NewFromUtf8(isolate, s)

#define IVAN_SET_METHOD(isolate, target, name, fn)                            \
  USE(target->Set(isolate->GetCurrentContext(),                               \
                   IVAN_STRING(isolate, name),                                \
                   v8::FunctionTemplate::New(isolate, fn)->GetFunction()))

inline void IVAN_SET_PROTO_METHOD(
    v8::Isolate* isolate,
    v8::Local<v8::FunctionTemplate> that,
    const char* name,
    v8::FunctionCallback callback) {
  v8::Local<v8::Signature> signature = v8::Signature::New(isolate, that);
  v8::Local<v8::FunctionTemplate> t =
    v8::FunctionTemplate::New(isolate, callback, v8::Local<v8::Value>(), signature);
  v8::Local<v8::String> name_string = IVAN_STRING(isolate, name);
  that->PrototypeTemplate()->Set(name_string, t);
}

#define IVAN_THROW_EXCEPTION(isolate, message) \
  (void) isolate->ThrowException(v8::Exception::Error(IVAN_STRING(isolate, message)))

#define IVAN_REGISTER_INTERNAL(name, fn)                                      \
  static ivan::ivan_module _ivan_module_##name = {#name, fn};                 \
  void _ivan_register_##name() {                                              \
    ivan_module_register(&_ivan_module_##name);                               \
  }

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
  kBindingCache,
};

static v8::Eternal<v8::Function> promise_reject_handler;
static v8::Eternal<v8::Function> next_tick_handler;

class InternalCallbackScope {
 public:
  explicit InternalCallbackScope(v8::Isolate* isolate) : isolate_(isolate) {}

  ~InternalCallbackScope() {
    isolate_->RunMicrotasks();
    printf("eternal is empty: %d\n", next_tick_handler.IsEmpty());
    if (!next_tick_handler.IsEmpty())
      next_tick_handler.Get(isolate_)->Call(v8::Undefined(isolate_), 0, nullptr);
  }
 private:
  v8::Isolate* isolate_;
};

}  // namespace ivan

#endif  // SRC_IVAN_H_
