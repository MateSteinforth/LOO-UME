#pragma once

#include <cstdint>
#include <cstring>

#define PROGMEM
#define PSTR(value) (value)
#define F(value) (value)
#define memcpy_P std::memcpy
#define memmove_P std::memmove
#define strlen_P std::strlen
#define strcpy_P std::strcpy
#define strcmp_P std::strcmp
#define pgm_read_byte(address) (*reinterpret_cast<const std::uint8_t *>(address))
#define pgm_read_word(address) (*reinterpret_cast<const std::uint16_t *>(address))
#define pgm_read_dword(address) (*reinterpret_cast<const std::uint32_t *>(address))
#define pgm_read_ptr(address) (*reinterpret_cast<const void *const *>(address))

using PGM_P = const char *;
