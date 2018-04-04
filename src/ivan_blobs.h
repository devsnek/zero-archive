#ifndef SRC_IVAN_BLOBS_H_
#define SRC_IVAN_BLOBS_H_

#include <v8.h>

namespace ivan {
namespace blobs {

void DefineJavaScript(v8::Isolate* isolate, v8::Local<v8::Object> target);
v8::Local<v8::String> MainSource(v8::Isolate* isolate);

}  // namespace blobs
}  // namespace ivan

#endif  // SRC_IVAN_BLOBS_H_
