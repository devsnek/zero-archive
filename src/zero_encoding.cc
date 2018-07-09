#include <unicode/utypes.h>
#include <unicode/putil.h>
#include <unicode/uchar.h>
#include <unicode/uclean.h>
#include <unicode/udata.h>
#include <unicode/uidna.h>
#include <unicode/ucnv.h>
#include <unicode/utf8.h>
#include <unicode/utf16.h>
#include <unicode/ulocdata.h>
#include <unicode/uvernum.h>
#include <unicode/uversion.h>
#include <unicode/ustring.h>

#include "v8.h"
#include "zero.h"
#include "base_object-inl.h"

using v8::ArrayBuffer;
using v8::ArrayBufferCreationMode;
using v8::ArrayBufferView;
using v8::Context;
using v8::FunctionCallbackInfo;
using v8::HandleScope;
using v8::Isolate;
using v8::Local;
using v8::MaybeLocal;
using v8::Object;
using v8::ObjectTemplate;
using v8::String;
using v8::Uint8Array;
using v8::Value;

// https://github.com/nodejs/node/blob/master/src/node_i18n.cc

namespace zero {
namespace encoding {

static void EncodeUtf8String(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  Local<String> str = args[0].As<String>();
  size_t length = str->Utf8Length();
  char* data = UncheckedMalloc(length);
  str->WriteUtf8(data,
                 -1,   // We are certain that `data` is sufficiently large
                 nullptr,
                 String::NO_NULL_TERMINATION | String::REPLACE_INVALID_UTF8);
  auto array_buf = ArrayBuffer::New(isolate, data, length,
                                    ArrayBufferCreationMode::kInternalized);
  auto array = Uint8Array::New(array_buf, 0, length);
  args.GetReturnValue().Set(array);
}

class Decoder : public BaseObject {
 public:
  enum ConverterFlags {
    FLAGS_FLUSH      = 0x1,
    FLAGS_FATAL      = 0x2,
    FLAGS_IGNORE_BOM = 0x4
  };

  Decoder(Isolate* isolate,
          Local<Object> obj,
          const char* name,
          unsigned int flags) :
    BaseObject(isolate, obj) {
    MakeWeak();

    ignore_bom_ = (flags & FLAGS_IGNORE_BOM) == FLAGS_IGNORE_BOM;

    UErrorCode status = U_ZERO_ERROR;
    conv_ = ucnv_open(name, &status);
    CHECK(U_SUCCESS(status));

    if ((flags & FLAGS_FATAL) == FLAGS_FATAL) {
      status = U_ZERO_ERROR;
      ucnv_setToUCallBack(conv_, UCNV_TO_U_CALLBACK_STOP,
                          nullptr, nullptr, nullptr, &status);
    }

    switch (ucnv_getType(conv_)) {
      case UCNV_UTF8:
      case UCNV_UTF16_BigEndian:
      case UCNV_UTF16_LittleEndian:
        unicode_ = true;
        break;
      default:
        unicode_ = false;
    }
  }

  ~Decoder() {
    ucnv_close(conv_);
  }

  // label, flags
  static void Create(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    Local<Object> that = args.This();

    String::Utf8Value label(isolate, args[0]);
    unsigned int flags = args[1]->Uint32Value();

    new Decoder(isolate, that, *label, flags);

    args.GetReturnValue().Set(that);
  }

  // buffer, flags
  static void Decode(const FunctionCallbackInfo<Value>& args) {
    Decoder* obj;
    ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());
    Isolate* isolate = args.GetIsolate();
    Local<Context> context = isolate->GetCurrentContext();

    Local<ArrayBufferView> input = args[0].As<ArrayBufferView>();
    ArrayBuffer::Contents input_c = input->Buffer()->GetContents();
    const size_t input_offset = input->ByteOffset();
    const size_t input_length = input->ByteLength();
    char* const input_data = static_cast<char*>(input_c.Data()) + input_offset;

    unsigned int flags = args[1]->Uint32Value(context).ToChecked();
    UBool flush = (flags & FLAGS_FLUSH) == FLAGS_FLUSH;

    UErrorCode status = U_ZERO_ERROR;
    size_t limit = ucnv_getMinCharSize(obj->conv_) * input_length;

    const char* source = input_data;
    size_t source_length = input_length;
    if (obj->unicode_ && !obj->ignore_bom_ && !obj->bom_seen_) {
      int32_t bom_offset = 0;
      ucnv_detectUnicodeSignature(source, source_length, &bom_offset, &status);
      source += bom_offset;
      source_length -= bom_offset;
      obj->bom_seen_ = true;
    }

    UChar* result = Malloc<UChar>(limit);

    UChar* target = result;
    ucnv_toUnicode(obj->conv_,
                   &target, target + (limit * sizeof(UChar)),
                   &source, source + source_length,
                   nullptr, flush, &status);

    if (U_SUCCESS(status)) {
      auto data = reinterpret_cast<uint16_t*>(result);
      if (IsBigEndian()) {
        uint16_t temp;
        for (size_t i = 0; i < limit; i += sizeof(temp)) {
          memcpy(&temp, &data[i], sizeof(temp));
          temp = ((temp) << 8) | ((temp) >> 8);
          memcpy(&data[i], &temp, sizeof(temp));
        }
      }
      MaybeLocal<String> s =
        String::NewFromTwoByte(isolate, data, v8::NewStringType::kNormal, target - result);
      args.GetReturnValue().Set(s.ToLocalChecked());
    } else {
      args.GetReturnValue().Set(status);
    }

    if (flush) {
      // Reset the converter state
      obj->bom_seen_ = false;
      ucnv_reset(obj->conv_);
    }
  }

 private:
  UConverter* conv_;
  bool unicode_ = false;     // True if this is a Unicode converter
  bool ignore_bom_ = false;   // True if the BOM should be ignored on Unicode
  bool bom_seen_ = false;  // True if the BOM has been seen
};

void Init(Local<Context> context, Local<Object> target) {
  Isolate* isolate = context->GetIsolate();

  Local<v8::FunctionTemplate> tpl =
    BaseObject::MakeJSTemplate(isolate, "NativeDecoder", Decoder::Create);
  ZERO_SET_PROTO_PROP(context, tpl, "decode", Decoder::Decode);
  ZERO_SET_PROPERTY(context, target, "NativeDecoder", tpl->GetFunction());

  ZERO_SET_PROPERTY(context, target, "encodeUtf8String", EncodeUtf8String);

  ZERO_SET_PROPERTY(context, target, "FLAGS_FLUSH", Decoder::FLAGS_FLUSH);
  ZERO_SET_PROPERTY(context, target, "FLAGS_FATAL", Decoder::FLAGS_FATAL);
  ZERO_SET_PROPERTY(context, target, "FLAGS_IGNORE_BOM", Decoder::FLAGS_IGNORE_BOM);
}

}  // namespace encoding
}  // namespace zero

ZERO_REGISTER_INTERNAL(encoding, zero::encoding::Init);
