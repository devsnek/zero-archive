#!/bin/bash

set -ex

export PATH=$PATH:"$(pwd)/tools/depot_tools"

if [ ! -d deps/v8 ]; then
  cd deps && gclient sync
fi

if [ ! -f deps/v8/out.gn/x64.release/args.gn ]; then
  cd deps/v8
  tools/dev/v8gen.py x64.release -vv
  cp ../../tools/v8_args.gn ./out.gn/x64.release/args.gn
  gn gen out.gn/x64.release --check
fi

ninja -C deps/v8/out.gn/x64.release v8_monolith
