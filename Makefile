CC = g++
LIBS = -luv deps/v8/out.gn/x64.release/obj/{libv8_monolith,third_party/icu/libicu{uc,i18n}}.a
INCLUDES = -Ideps/v8/include
CFLAGS = -Wall -std=c++1z -stdlib=libc++
CFILES = $(wildcard src/*.cc)
HFILES = $(wildcard src/*.h)

ivan: directories ivan_blobs $(CFILES)
	$(CC) $(CFILES) out/ivan_blobs.cc $(CFLAGS) $(LIBS) $(INCLUDES) -o out/ivan

ivan_blobs:
	python tools/blob2c.py out/ivan_blobs.cc $(shell find lib -type f -name '*.js')

directories:
	mkdir -p out

.PHONY: clean

clean:
	rm -rf out
