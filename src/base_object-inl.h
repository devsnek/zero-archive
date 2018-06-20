// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

#ifndef SRC_BASE_OBJECT_INL_H_
#define SRC_BASE_OBJECT_INL_H_

#include "base_object.h"
#include "zero.h"
#include "v8.h"

namespace zero {

inline BaseObject::BaseObject(v8::Isolate* isolate, v8::Local<v8::Object> handle)
    : persistent_handle_(isolate, handle),
      isolate_(isolate) {
  CHECK_EQ(false, handle.IsEmpty());
  // The zero field holds a pointer to the handle. Immediately set it to
  // nullptr in case it's accessed by the user before construction is complete.
  CHECK_GT(handle->InternalFieldCount(), 0);
  handle->SetAlignedPointerInInternalField(0, static_cast<void*>(this));
}

inline BaseObject::~BaseObject() {
  if (persistent_handle_.IsEmpty()) {
    // This most likely happened because the weak callback below cleared it.
    return;
  }

  {
    v8::HandleScope handle_scope(isolate_);
    object()->SetAlignedPointerInInternalField(0, nullptr);
  }
}


template <typename T>
inline T* BaseObject::FromJSObject(v8::Local<v8::Object> obj) {
  CHECK_GT(obj->InternalFieldCount(), 0);
  return static_cast<T*>(obj->GetAlignedPointerFromInternalField(0));
}


inline BaseObject* BaseObject::FromJSObject(v8::Local<v8::Object> obj) {
  return FromJSObject<BaseObject>(obj);
}


inline void BaseObject::MakeWeak() {
  persistent_handle_.SetWeak(
      this,
      [](const v8::WeakCallbackInfo<BaseObject>& data) {
        BaseObject* obj = data.GetParameter();
        // Clear the persistent handle so that ~BaseObject() doesn't attempt
        // to mess with internal fields, since the JS object may have
        // transitioned into an invalid state.
        // Refs: https://github.com/nodejs/node/issues/18897
        obj->persistent_handle_.Reset();
        delete obj;
      }, v8::WeakCallbackType::kParameter);
}


inline void BaseObject::ClearWeak() {
  persistent_handle_.ClearWeak();
}


v8::Local<v8::FunctionTemplate>
BaseObject::MakeJSTemplate(v8::Isolate* isolate,
                           const char* name,
                           v8::FunctionCallback constructor) {
  v8::Local<v8::FunctionTemplate> tpl = v8::FunctionTemplate::New(isolate, constructor);
  tpl->SetClassName(ZERO_STRING(isolate, name));
  tpl->InstanceTemplate()->SetInternalFieldCount(1);
  return tpl;
}

}  // namespace zero

#endif  // SRC_BASE_OBJECT_INL_H_
