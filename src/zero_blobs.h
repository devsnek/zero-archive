#ifndef SRC_ZERO_BLOBS_H_
#define SRC_ZERO_BLOBS_H_

#include "v8.h"

namespace zero {
namespace blobs {

void DefineJavaScript(v8::Isolate* isolate, v8::Local<v8::Object> target);
v8::Local<v8::String> MainSource(v8::Isolate* isolate);

}  // namespace blobs
}  // namespace zero

#endif  // SRC_ZERO_BLOBS_H_
