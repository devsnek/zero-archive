import sys
import re
import os

TEMPLATE = """\
#include "../src/ivan.h"
#include "../src/ivan_blobs.h"
#include "v8.h"

using namespace v8;

namespace ivan {{
namespace blobs {{

{definitions}

Local<String> MainSource(Isolate* isolate) {{
  return ivan_value.ToStringChecked(isolate);
}};

void DefineJavaScript(Isolate* isolate, Local<Object> target) {{
  {initializers}
}}

}}
}}
"""

ONE_BYTE_STRING = """
static const uint8_t raw_{var}[] = {{ {data} }};
static struct : public v8::String::ExternalOneByteStringResource {{
  const char* data() const override {{
    return reinterpret_cast<const char*>(raw_{var});
  }}
  size_t length() const override {{ return arraysize(raw_{var}); }}
  void Dispose() override {{ /* Default calls `delete this`. */ }}
  v8::Local<v8::String> ToStringChecked(v8::Isolate* isolate) {{
    return v8::String::NewExternalOneByte(isolate, this).ToLocalChecked();
  }}
}} {var};
"""

TWO_BYTE_STRING = """
static const uint16_t raw_{var}[] = {{ {data} }};
static struct : public v8::String::ExternalStringResource {{
  const uint16_t* data() const override {{ return raw_{var}; }}
  size_t length() const override {{ return arraysize(raw_{var}); }}
  void Dispose() override {{ /* Default calls `delete this`. */ }}
  v8::Local<v8::String> ToStringChecked(v8::Isolate* isolate) {{
    return v8::String::NewExternalTwoByte(isolate, this).ToLocalChecked();
  }}
}} {var};
"""

UNSIGNED_CHAR_STRING = """
const unsigned char raw_{var}[] = {{ {data} }};
const char* {var} = reinterpret_cast<const char*>(raw_{var});
"""

INITIALIZER = """\
CHECK(target->Set(isolate->GetCurrentContext(),
    {key}.ToStringChecked(isolate),
    {value}.ToStringChecked(isolate)).FromJust());
"""


def ToCArray(elements, step=10):
  elements = list(elements)
  # slices = (elements[i:i + step] for i in range(0, len(elements), step))
  # slices = map(lambda s: ','.join(str(x) for x in s), slices)
  # return ',\n'.join(slices)
  return ','.join([str(x) for x in elements])


def ToCString(contents):
  return ToCArray(map(ord, contents), step=20)


def Render(var, data, raw=False):
  if raw:
    template = UNSIGNED_CHAR_STRING
    data = ','.join(map(hex, data))
  elif any(ord(c) > 127 for c in data):
    data = map(ord, data.decode('utf-8').encode('utf-16be'))
    data = [data[i] * 256 + data[i + 1] for i in xrange(0, len(data), 2)]
    data = ToCArray(data)
    template = TWO_BYTE_STRING
  else:
    template = ONE_BYTE_STRING
    data = ToCString(data)
  return template.format(var=var, data=data)


def Blob2C(sources, target):
  definitions = []
  initializers = []

  for name in sources:
    mode = 'rb' if name.endswith('.bin') else 'rt'
    with open(name, mode) as file:
      data = file.read()

      if '/' in name or '\\' in name:
        split = re.split('/|\\\\', name)
        name = '/'.join(split)

      raw = name.endswith('.bin')
      name = os.path.splitext(name)[0]
      name = re.sub(r'^\/?lib\/', '', name)
      name = re.sub(r'^\/?deps\/v8\/out.gn\/x64.release\/', '', name)
      var = name.replace('-', '_').replace('/', '_').replace('.', '_')
      key = '%s_key' % var
      value = '%s_value' % var

      if not raw:
        definitions.append(Render(key, name))
        initializers.append(INITIALIZER.format(key=key, value=value))
      definitions.append(Render(value, data, raw))

  with open(target, 'w') as output:
    output.write(TEMPLATE.format(definitions=''.join(definitions),
                                 initializers=''.join(initializers)))

if __name__ == '__main__':
  target = sys.argv[1]
  source_files = sys.argv[2:]
  Blob2C(source_files, target)
