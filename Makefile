CC = g++
LIBS = $(shell pkg-config --libs --cflags icu-uc icu-io icu-i18n libuv)
CFLAGS = -Wall -std=c++1z -stdlib=libc++
CFILES = $(wildcard src/*.cc)
HFILES = $(wildcard src/*.h)
JSFILES = $(shell find lib -type f -name '*.js')
V8FILES = $(shell echo deps/v8/out.gn/x64.release/obj/{libv8_monolith,third_party/icu/libicu{uc,i18n}}.a)
INCLUDES = -Ideps/v8/include

out/edge: $(V8FILES) out/edge_blobs.cc $(CFILES) $(HFILES) | out
	$(CC) $(CFILES) out/edge_blobs.cc $(V8FILES) $(CFLAGS) $(LIBS) $(INCLUDES) -o $@

out/edge_blobs.cc: $(JSFILES) config.json | out
	node tools/blob2c.js $@ $(JSFILES) config.json

out:
	mkdir -p out

$(V8FILES):
	ninja -C deps/v8/out.gn/x64.release v8_monolith

config.json: configure
	$(error Missing or stale $@, please run ./configure)

clean:
	rm -rf out

.PHONY: clean
