#ifndef _SRC_IVAN_ERROR_H
#define _SRC_IVAN_ERROR_H

#include <v8.h>

namespace ivan {

#define V(name) \
  static v8::Local<v8::Private> name(v8::Isolate* isolate) { \
    return v8::Private::ForApi(isolate, v8::String::NewFromUtf8(isolate, "Ivan##name")); \
  }
V(ErrorPrivate)
V(ErrorArrow)
#undef V

bool IsExceptionDecorated(v8::Isolate* isolate, v8::Local<v8::Value> er) {
  if (!er.IsEmpty() && er->IsObject()) {
    auto err = er.As<v8::Object>();
    auto maybe_value = err->GetPrivate(isolate->GetCurrentContext(), ErrorPrivate(isolate));
    v8::Local<v8::Value> decorated;
    return maybe_value.ToLocal(&decorated) && decorated->IsTrue();
  }
  return false;
}

static void AppendExceptionLine(
  v8::Isolate* isolate, v8::Local<v8::Value> er, v8::Local<v8::Message> message) {
  if (message.IsEmpty())
    return;

  v8::HandleScope scope(isolate);
  v8::Local<v8::Object> err_obj;
  if (!er.IsEmpty() && er->IsObject()) {
    err_obj = er.As<v8::Object>();
  }

  // Print (filename):(line number): (message).
  v8::ScriptOrigin origin = message->GetScriptOrigin();
  v8::String::Utf8Value filename(isolate, message->GetScriptResourceName());
  const char* filename_string = *filename;
  int linenum = message->GetLineNumber();
  // Print line of source code.
  v8::String::Utf8Value sourceline(isolate, message->GetSourceLine());
  const char* sourceline_string = *sourceline;
  if (strstr(sourceline_string, "node-do-not-add-exception-line") != nullptr)
    return;
  
  v8::Local<v8::Context> context = isolate->GetCurrentContext();

  int script_start =
      (linenum - origin.ResourceLineOffset()->Value()) == 1 ?
          origin.ResourceColumnOffset()->Value() : 0;
  int start = message->GetStartColumn(context).FromMaybe(0);
  int end = message->GetEndColumn(context).FromMaybe(0);
  if (start >= script_start) {
    CHECK_GE(end, start);
    start -= script_start;
    end -= script_start;
  }

  char arrow[1024];
  int max_off = sizeof(arrow) - 2;

  int off = snprintf(arrow,
                     sizeof(arrow),
                     "%s:%i\n%s\n",
                     filename_string,
                     linenum,
                     sourceline_string);
  CHECK_GE(off, 0);
  if (off > max_off) {
    off = max_off;
  }

  // Print wavy underline (GetUnderline is deprecated).
  for (int i = 0; i < start; i++) {
    if (sourceline_string[i] == '\0' || off >= max_off) {
      break;
    }
    CHECK_LT(off, max_off);
    arrow[off++] = (sourceline_string[i] == '\t') ? '\t' : ' ';
  }
  for (int i = start; i < end; i++) {
    if (sourceline_string[i] == '\0' || off >= max_off) {
      break;
    }
    CHECK_LT(off, max_off);
    arrow[off++] = '^';
  }
  CHECK_LE(off, max_off);
  arrow[off] = '\n';
  arrow[off + 1] = '\0';

  // v8::Local<v8::String> arrow_str = v8::String::NewFromUtf8(isolate, arrow);

  // const bool can_set_arrow = !arrow_str.IsEmpty() && !err_obj.IsEmpty();

  // If allocating arrow_str failed, print it out. There's not much else to do.
  // If it's not an error, but something needs to be printed out because
  // it's a fatal exception, also print it out from here.
  // Otherwise, the arrow property will be attached to the object and handled
  // by the caller.
  /*
  if (!can_set_arrow || (mode == FATAL_ERROR && !err_obj->IsNativeError())) {
    if (env->printed_error())
      return;
    env->set_printed_error(true);

    uv_tty_reset_mode();
    PrintErrorString("\n%s", arrow);
    return;
  }
  */

  /*CHECK(err_obj->SetPrivate(
            env->context(),
            env->arrow_message_private_symbol(),
            arrow_str).FromMaybe(false));*/
}


void DecorateException(v8::Isolate* isolate, const v8::TryCatch& try_catch) {
  v8::Local<v8::Value> exception = try_catch.Exception();
  if (!exception->IsObject())
    return;

  v8::Local<v8::Object> err_obj = exception.As<v8::Object>();
  if (IsExceptionDecorated(isolate, err_obj))
    return;

  AppendExceptionLine(isolate, exception, try_catch.Message());
  v8::Local<v8::Context> context = isolate->GetCurrentContext();

  v8::Local<v8::Value> stack = err_obj->Get(v8::String::NewFromUtf8(isolate, "stack"));
  v8::MaybeLocal<v8::Value> maybe_value = err_obj->GetPrivate(context, ErrorArrow(isolate));

  v8::Local<v8::Value> arrow;
  if (!(maybe_value.ToLocal(&arrow) && arrow->IsString()))
    return;
  if (stack.IsEmpty() || !stack->IsString())
    return;

  v8::Local<v8::String> decorated_stack = v8::String::Concat(
    v8::String::Concat(arrow.As<v8::String>(), v8::String::NewFromUtf8(isolate, "\n")),
    stack.As<v8::String>()
  );

  err_obj->Set(v8::String::NewFromUtf8(isolate, "stack"), decorated_stack);

  err_obj->SetPrivate(context, ErrorPrivate(isolate), v8::True(isolate));
}

} // namespace ivan

#endif
