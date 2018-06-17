CC = g++
CFLAGS = -Wall -std=c++1z -stdlib=libc++

CFILES = $(wildcard src/*.cc)
HFILES = $(wildcard src/*.h)
JSFILES = $(shell find lib -type f -name '*.js')

V8 = deps/v8/out.gn/x64.release/obj/libv8_monolith.a
LIBUV = deps/libuv/out/Release/libuv.a
ICU = $(shell pkg-config --libs --cflags icu-uc icu-io icu-i18n)
LIBFFI = $(shell pkg-config --libs --cflags libffi)

LIBS = $(V8) $(LIBUV) $(ICU) $(LIBFFI)

INCLUDES = -Ideps/v8/include -Ideps/libuv/include

out/edge: $(LIBS) $(CFLIES) $(HFILES) out/edge_blobs.cc | out
	$(CC) $(CFLAGS) $(INCLUDES) $(LIBS) $(CFILES) out/edge_blobs.cc -o $@

$(V8):
	ninja -C deps/v8/out.gn/x64.release v8_monolith

$(LIBUV):
	cd deps/libuv && ./gyp_uv.py -f make -Duv_library=static_library
	BUILDTYPE=Release make -C deps/libuv/out libuv

$(ICU):
	$(shell :)

$(LIBFFI):
	$(shell :)

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

.PHONY: clean
