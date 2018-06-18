CC = g++
CFLAGS = -Wall -std=c++1z -stdlib=libc++

CFILES = $(wildcard src/*.cc)
HFILES = $(wildcard src/*.h)
JSFILES = $(shell find lib -type f -name '*.js')

V8 = deps/v8/out.gn/x64.release/obj/libv8_monolith.a
LIBUV = deps/libuv/out/Release/libuv.a
ICU = $(shell pkg-config --libs --cflags icu-uc icu-io icu-i18n)
LIBFFI = deps/libffi/build_out/.libs/libffi.a

LIBS = $(V8) $(LIBUV) $(LIBFFI)

INCLUDES = -Ideps/v8/include -Ideps/libuv/include -Ideps/libffi/build_out/include

PATH := $(PWD)/tools/depot_tools:$(PATH)

out/edge: $(LIBS) $(CFLIES) $(HFILES) out/edge_blobs.cc | out
	$(CC) $(CFLAGS) $(INCLUDES) $(LIBS) $(ICU) $(CFILES) out/edge_blobs.cc -o $@

$(V8):
	if [ ! -d deps/v8 ]; then \
		cd deps && gclient sync; \
	fi
	if [ ! -f deps/v8/out.gn/x64.release/args.gn ]; then \
		cd deps/v8; \
		tools/dev/v8gen.py x64.release -vv; \
		cp ../../tools/v8_args.gn ./out.gn/x64.release/args.gn; \
		gn gen out.gn/x64.release --check; \
	fi
	ninja -C deps/v8/out.gn/x64.release v8_monolith

$(LIBUV):
	git clone https://chromium.googlesource.com/external/gyp deps/libuv/build/gyp
	cd deps/libuv && ./gyp_uv.py -f make -Duv_library=static_library
	BUILDTYPE=Release make -C deps/libuv/out libuv

$(LIBFFI):
	cd deps/libffi && ./autogen.sh
	# use build_out to match "build_*" in libffi's .gitignore
	cd deps/libffi && ./configure --enable-static --enable-builddir=build_out
	make -C deps/libffi

$(CFILES): out/edge_blobs.cc

out/edge_blobs.cc: $(JSFILES) out/config.json | out
	node tools/blob2c.js $@ $(JSFILES) out/config.json

out:
	mkdir -p out

out/config.json: configure
	@if [ -x out/config.status ]; then \
		./out/config.status; \
	else \
		echo Missing or stale $@, please run ./$<; \
		exit 1; \
	fi

clean:
	rm -rf out

lint-js:
	eslint lib/ test/ --ignore-pattern="test/web-platform-tests"

lint-cpp:
	tools/cpplint/cpplint.py src/*.{cc,h}

lint: | lint-js lint-cpp

_autoconf: | out
	./configure --expose-binding

test: | lint _autoconf out/edge
	tools/test.js test

.PHONY: clean test lint-js lint-cpp _autoconf
