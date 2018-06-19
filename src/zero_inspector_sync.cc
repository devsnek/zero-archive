#include "v8.h"
#include "v8-inspector.h"
#include "zero.h"

using v8::Array;
using v8::Context;
using v8::Global;
using v8::Local;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::Object;
using v8::Isolate;
using v8::String;
using v8::Value;
using v8::Value;

namespace zero {
namespace inspector {

class InspectorFrontend final : public v8_inspector::V8Inspector::Channel {
 public:
  explicit InspectorFrontend(Local<Context> context, Local<Function> callback) {
    isolate_ = context->GetIsolate();
    context_.Reset(isolate_, context);
    callback_.Reset(isolate_, callback);
  }
  virtual ~InspectorFrontend() = default;

 private:
  void sendResponse(int callId, std::unique_ptr<v8_inspector::StringBuffer> message) override {
    Send(message->string());
  }

  void sendNotification(std::unique_ptr<v8_inspector::StringBuffer> message) override {
    Send(message->string());
  }

  void flushProtocolNotifications() override {}

  void Send(const v8_inspector::StringView& string) {
    v8::Isolate::AllowJavascriptExecutionScope allow_script(isolate_);

    int length = static_cast<int>(string.length());
    Local<String> message =
        (string.is8Bit()
             ? v8::String::NewFromOneByte(
                   isolate_,
                   reinterpret_cast<const uint8_t*>(string.characters8()),
                   v8::NewStringType::kNormal, length)
             : v8::String::NewFromTwoByte(
                   isolate_,
                   reinterpret_cast<const uint16_t*>(string.characters16()),
                   v8::NewStringType::kNormal, length))
            .ToLocalChecked();

    Local<Context> context = context_.Get(isolate_);
    Local<Function> callback = callback_.Get(isolate_);
    v8::TryCatch try_catch(isolate_);
    Local<Value> args[] = { message };
    USE(callback->Call(context, Undefined(isolate_), 1, args));
  }

  Isolate* isolate_;
  Global<Context> context_;
  Global<Function> callback_;
};

class InspectorClient : public v8_inspector::V8InspectorClient {
 public:
  InspectorClient(Local<Context> context, Local<Function> callback) {
    isolate_ = context->GetIsolate();

    channel_.reset(new InspectorFrontend(context, callback));
    inspector_ = v8_inspector::V8Inspector::create(isolate_, this);
    session_ = inspector_->connect(kContextGroupId, channel_.get(), v8_inspector::StringView());
    inspector_->contextCreated(
        v8_inspector::V8ContextInfo(context, kContextGroupId, v8_inspector::StringView()));

    context_.Reset(isolate_, context);
  }

  static void SendInspectorMessage(const v8::FunctionCallbackInfo<v8::Value>& args) {
    Isolate* isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);
    Local<Context> context = isolate->GetCurrentContext();

    v8_inspector::V8InspectorSession* session = GetSession(context);

    Local<String> message = args[0]->ToString(context).ToLocalChecked();
    int length = message->Length();
    std::unique_ptr<uint16_t[]> buffer(new uint16_t[length]);

    message->Write(buffer.get(), 0, length);

    v8_inspector::StringView message_view(buffer.get(), length);
    session->dispatchProtocolMessage(message_view);

    args.GetReturnValue().Set(v8::True(isolate));
  }

  static InspectorClient* GetClient(Local<Context> context) {
    return static_cast<InspectorClient*>(
        context->GetAlignedPointerFromEmbedderData(EmbedderKeys::kInspector));
  }

 private:
  static v8_inspector::V8InspectorSession* GetSession(Local<Context> context) {
    InspectorClient* client = GetClient(context);
    if (client == nullptr)
      return nullptr;
    return client->session_.get();
  }

  static const int kContextGroupId = 1;

  std::unique_ptr<v8_inspector::V8Inspector> inspector_;
  std::unique_ptr<v8_inspector::V8InspectorSession> session_;
  std::unique_ptr<v8_inspector::V8Inspector::Channel> channel_;
  Global<Context> context_;
  Isolate* isolate_;
};

void Start(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();

  auto inspector_client = InspectorClient::GetClient(context);
  if (inspector_client != nullptr)
    return;

  Local<Function> callback = args[0].As<Function>();

  context->SetAlignedPointerInEmbedderData(
      EmbedderKeys::kInspector, new InspectorClient(context, callback));

  args.GetReturnValue().Set(
      FunctionTemplate::New(isolate, InspectorClient::SendInspectorMessage)->GetFunction());
}

void Stop(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();

  auto inspector_client = InspectorClient::GetClient(context);

  if (inspector_client != nullptr) {
    delete inspector_client;
    args.GetReturnValue().Set(True(isolate));
  } else {
    args.GetReturnValue().Set(False(isolate));
  }
}

void Init(Local<Context> context, Local<Object> target) {
  ZERO_SET_PROPERTY(context, target, "start", Start);
  ZERO_SET_PROPERTY(context, target, "stop", Stop);
}

}  // namespace inspector
}  // namespace zero

ZERO_REGISTER_INTERNAL(inspector_sync, zero::inspector::Init);
