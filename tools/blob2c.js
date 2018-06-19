'use strict';

/* eslint-env node */

const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

const [output, ...inputs] = process.argv.slice(2);

const TEMPLATE = `\
#include "../src/zero.h"
#include "../src/zero_blobs.h"
#include "v8.h"

using namespace v8;

namespace zero {
namespace blobs {

{definitions}

Local<String> MainSource(Isolate* isolate) {
  return zero_value.ToStringChecked(isolate);
};

void DefineJavaScript(Isolate* isolate, Local<Object> target) {
  {initializers}
}

}  // namespace blobs
}  // namespace zero
`;

const ONE_BYTE_STRING = `
static const uint8_t raw_{name}[] = { {data} };
static struct : public v8::String::ExternalOneByteStringResource {
  const char* data() const override {
    return reinterpret_cast<const char*>(raw_{name});
  }
  size_t length() const override { return arraysize(raw_{name}); }
  void Dispose() override { /* Default calls \`delete this\`. */ }
  v8::Local<v8::String> ToStringChecked(v8::Isolate* isolate) {
    return v8::String::NewExternalOneByte(isolate, this).ToLocalChecked();
  }
} {name};
`;

const TWO_BYTE_STRING = `
static const uint16_t raw_{name}[] = { {data} };
static struct : public v8::String::ExternalStringResource {
  const uint16_t* data() const override { return raw_{name}; }
  size_t length() const override { return arraysize(raw_{name}); }
  void Dispose() override { /* Default calls \`delete this\`. */ }
  v8::Local<v8::String> ToStringChecked(v8::Isolate* isolate) {
    return v8::String::NewExternalTwoByte(isolate, this).ToLocalChecked();
  }
} {name};
`;

const INITIALIZER = `\
CHECK(target->Set(isolate->GetCurrentContext(),
                  {key}.ToStringChecked(isolate),
                  {value}.ToStringChecked(isolate)).FromJust());
`;

const format = (template, args) => {
  for (const [name, value] of Object.entries(args)) {
    template = template.replace(new RegExp(`\\{${name}\\}`, 'g'), value);
  }
  return template;
};

const utf16be = (str) => {
  const buffer = Buffer.from(str, 'UCS-2');
  const l = buffer.length;
  if (l & 0x01) {
    throw new Error('uneven buffer length');
  }
  for (let i = 0; i < l; i += 2) {
    const e = buffer[i];
    buffer[i] = buffer[i + 1];
    buffer[i + 1] = e;
  }
  return buffer;
};

const render = (name, source) => {
  let template;
  let data = '';
  source = Buffer.from(source);
  if (source.some((c) => c > 127)) {
    template = TWO_BYTE_STRING;
    const utf16 = utf16be(source.toString());
    for (let i = 0; i < utf16.length; i += 2) {
      data += `${(utf16[i] * 256) + (utf16[i + 1] || 0)},`;
    }
  } else {
    template = ONE_BYTE_STRING;
    for (let i = 0; i < source.length; i += 1) {
      data += `${source[i]},`;
    }
  }

  return format(template, { name, data });
};

const definitions = [];
const initializers = [];

for (const input of inputs) {
  const source = readFileSync(path.resolve(process.cwd(), input), 'utf8');

  const name = input.split('.')[0].replace(/^lib\//, '');
  const varName = name.replace(/[^a-zA-Z0-9]/g, '_');
  const key = `${varName}_key`;
  const value = `${varName}_value`;

  definitions.push(render(key, name));
  definitions.push(render(value, source));
  initializers.push(format(INITIALIZER, { key, value }));
}

const final = format(TEMPLATE, {
  definitions: definitions.join(''),
  initializers: initializers.join(''),
});

writeFileSync(path.resolve(process.cwd(), output), final);
