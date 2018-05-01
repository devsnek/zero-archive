CC = g++
LIBS = -luv deps/v8/out.gn/x64.release/obj/{libv8_monolith,third_party/icu/libicu{uc,i18n}}.a
INCLUDES = -Ideps/v8/include
CFLAGS = -Wall -std=c++1z -stdlib=libc++
CFILES = $(wildcard src/*.cc)
HFILES = $(wildcard src/*.h)
JSFILES = $(shell find lib -type f -name '*.js')

out/ivan: out out/ivan_blobs.cc $(CFILES) $(HFILES)
	$(CC) $(CFILES) out/ivan_blobs.cc $(CFLAGS) $(LIBS) $(INCLUDES) -o $@

out/ivan_blobs.cc: $(JSFILES)
	python $@ out/ivan_blobs.cc $^

out:
	mkdir -p out

.PHONY: clean

clean:
	rm -rf out
