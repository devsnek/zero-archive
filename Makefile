CC = g++
LIBS = -luv
CFLAGS = -Wall -std=c++1z -stdlib=libc++
CFILES = $(wildcard src/*.cc)
HFILES = $(wildcard src/*.h)
JSFILES = $(shell find lib -type f -name '*.js')
V8FILES = $(shell echo deps/v8/out.gn/x64.release/obj/{libv8_monolith,third_party/icu/libicu{uc,i18n}}.a)
INCLUDES = -Ideps/v8/include $(V8FILES)

out/ivan: out v8 out/ivan_blobs.cc $(CFILES) $(HFILES)
	$(CC) $(CFILES) out/ivan_blobs.cc $(CFLAGS) $(LIBS) $(INCLUDES) -o $@

out/ivan_blobs.cc: $(V8FILES) $(JSFILES)
	node tools/blob2c.js $@ $(JSFILES)

out:
	mkdir -p out

v8:
	ninja -C deps/v8/out.gn/x64.release v8_monolith

clean:
	rm -rf out

.PHONY: clean v8
