#ifndef SRC_EDGE_BLOBS_H_
#define SRC_EDGE_BLOBS_H_

#include "v8.h"

namespace edge {
namespace blobs {

void DefineJavaScript(v8::Isolate* isolate, v8::Local<v8::Object> target);
v8::Local<v8::String> MainSource(v8::Isolate* isolate);

}  // namespace blobs
}  // namespace edge

#endif  // SRC_EDGE_BLOBS_H_
