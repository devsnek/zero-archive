#!/bin/bash

set -ex

PATH=$PATH:"$(pwd)/tools/depot_tools"
export PATH

V8_ARCH=$1

if [ ! -d deps/v8 ]; then
  cd deps && gclient sync
fi

if [ ! -f "deps/v8/out.gn/$V8_ARCH.release/args.gn" ]; then
  cd deps/v8
  tools/dev/v8gen.py "$V8_ARCH.release" --no-goma -vv -- \
    "is_debug=false \
    is_component_build=false \
    v8_monolithic=true \
    v8_untrusted_code_mitigations=false \
    v8_use_external_startup_data=false \
    v8_enable_i18n_support=true"
  gn gen "out.gn/$V8_ARCH.release" --check
fi

ninja -C "deps/v8/out.gn/$V8_ARCH.release" v8_monolith
