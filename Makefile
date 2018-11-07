CC = g++
CFLAGS = -Wall -std=c++14

ifeq ($(shell uname),Darwin)
	CFLAGS += -stdlib=libc++
endif

UNAME_M=$(shell uname -m)
ifeq ($(findstring x86_64,$(UNAME_M)),x86_64)
DESTCPU ?= x64
else
ifeq ($(findstring ppc64,$(UNAME_M)),ppc64)
DESTCPU ?= ppc64
else
ifeq ($(findstring ppc,$(UNAME_M)),ppc)
DESTCPU ?= ppc
else
ifeq ($(findstring s390x,$(UNAME_M)),s390x)
DESTCPU ?= s390x
else
ifeq ($(findstring s390,$(UNAME_M)),s390)
DESTCPU ?= s390
else
ifeq ($(findstring arm,$(UNAME_M)),arm)
DESTCPU ?= arm
else
ifeq ($(findstring aarch64,$(UNAME_M)),aarch64)
DESTCPU ?= aarch64
else
ifeq ($(findstring powerpc,$(shell uname -p)),powerpc)
DESTCPU ?= ppc64
else
DESTCPU ?= x86
endif
endif
endif
endif
endif
endif
endif
endif
ifeq ($(DESTCPU),x64)
ARCH=x64
else
ifeq ($(DESTCPU),arm)
ARCH=arm
else
ifeq ($(DESTCPU),aarch64)
ARCH=arm64
else
ifeq ($(DESTCPU),ppc64)
ARCH=ppc64
else
ifeq ($(DESTCPU),ppc)
ARCH=ppc
else
ifeq ($(DESTCPU),s390)
ARCH=s390
else
ifeq ($(DESTCPU),s390x)
ARCH=s390x
else
ARCH=x86
endif
endif
endif
endif
endif
endif
endif

# pass the proper v8 arch name to $V8_ARCH based on user-specified $DESTCPU.
ifeq ($(DESTCPU),x86)
V8_ARCH=ia32
else
V8_ARCH ?= $(DESTCPU)

endif

# enforce "x86" over "ia32" as the generally accepted way of referring to 32-bit intel
ifeq ($(ARCH),ia32)
override ARCH=x86
endif
ifeq ($(DESTCPU),ia32)
override DESTCPU=x86
endif


CFILES = $(wildcard src/*.cc)
HFILES = $(wildcard src/*.h)
JSFILES = $(shell find lib -type f -name '*.js')

V8 = "deps/v8/out.gn/$(V8_ARCH).release/obj/libv8_monolith.a"
LIBUV = deps/libuv/out/Release/libuv.a
LIBFFI = deps/libffi/build_out/.libs/libffi.a

LIBS = $(LIBUV) $(LIBFFI)

INCLUDES = -Ideps/v8/include -Ideps/libuv/include -Ideps/libffi/build_out/include

out/zero: $(LIBS) $(CFLIES) $(HFILES) $(V8) out/zero_blobs.cc | out
	$(CC) $(CFLAGS) $(INCLUDES) $(V8) $(LIBS) -Ideps/v8/third_party/icu -Ldeps/v8/third_party/icu -licuio -licui18n -licuuc $(CFILES) out/zero_blobs.cc -o $@

$(V8):
	tools/build-v8.sh $(V8_ARCH)

$(LIBUV):
	git clone https://chromium.googlesource.com/external/gyp deps/libuv/build/gyp
	cd deps/libuv && ./gyp_uv.py -f make -Duv_library=static_library
	BUILDTYPE=Release make -C deps/libuv/out libuv

$(LIBFFI):
	cd deps/libffi && ./autogen.sh
	# use build_out to match "build_*" in libffi's .gitignore
	cd deps/libffi && ./configure --enable-static --enable-builddir=build_out
	make -C deps/libffi

$(CFILES): out/zero_blobs.cc

out/zero_blobs.cc: $(JSFILES) out/config.json | out
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

test: | lint out/zero
	tools/test.js test

.PHONY: clean test lint-js lint-cpp
