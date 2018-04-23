#include <uv.h>
#include <v8.h>

#include "ivan.h"

using v8::Isolate;
using v8::Local;
using v8::Object;

namespace ivan {
namespace tty {

static void Init(Isolate* isolate, Local<Object> exports) {
}

}
}

IVAN_REGISTER_INTERNAL(tty, ivan::tty::Init);
