#include <v8.h>
#include "ivan.h"

using namespace v8;

namespace ivan {
namespace util {

static void GetPromiseDetails(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();

  Local<Array> ret = Array::New(isolate, 2);
  info.GetReturnValue().Set(ret);

  if (!info[0]->IsPromise())
    return;

  Local<Promise> promise = info[0].As<Promise>();

  int state = promise->State();
  ret->Set(0, Integer::New(isolate, state));
  if (state != Promise::PromiseState::kPending)
    ret->Set(1, promise->Result());
}

static void Init(Isolate* isolate, Local<Object> target) {
  IVAN_INTERNAL_EXPOSE(target, GetPromiseDetails);
}

} // namespace util
} // namespace ivan

IVAN_REGISTER_INTERNAL(util, ivan::util::Init);
