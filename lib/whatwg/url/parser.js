'use strict';

/* eslint-disable no-control-regex */

({ namespace, load }) => {
  const {
    USERINFO_ENCODE_SET,
    PATH_ENCODE_SET,
    C0_CONTROL_ENCODE_SET,
    FRAGMENT_ENCODE_SET,
    QUERY_ENCODE_SET,
  } = load('whatwg/url/encode_sets');


  const STATE_UNKNOWN = -1;
  const STATE_SCHEME_START = 0;
  const STATE_SCHEME = 1;
  const STATE_NO_SCHEME = 2;
  const STATE_SPECIAL_RELATIVE_OR_AUTHORITY = 3;
  const STATE_PATH_OR_AUTHORITY = 4;
  const STATE_RELATIVE = 5;
  const STATE_RELATIVE_SLASH = 6;
  const STATE_SPECIAL_AUTHORITY_SLASHES = 7;
  const STATE_SPECIAL_AUTHORITY_IGNORE_SLASHES = 8;
  const STATE_AUTHORITY = 9;
  const STATE_HOST = 10;
  const STATE_HOSTNAME = 11;
  const STATE_PORT = 12;
  const STATE_FILE = 13;
  const STATE_FILE_SLASH = 14;
  const STATE_FILE_HOST = 15;
  const STATE_PATH_START = 16;
  const STATE_PATH = 17;
  const STATE_CANNOT_BE_BASE = 18;
  const STATE_QUERY = 19;
  const STATE_FRAGMENT = 20;

  const FLAG_NONE =
    namespace.FLAG_NONE = 0;
  const FLAG_FAILED =
    namespace.FLAG_FAILED = 1;
  const FLAG_CANNOT_BE_BASE =
    namespace.CANNOT_BE_BASE = 2;
  const FLAG_INVALID_PARSE_STATE =
    namespace.FLAG_INVALID_PARSE_STATE = 4;
  const FLAG_TERMINATED =
    namespace.FLAG_TERMINATED = 8;
  const FLAG_SPECIAL =
    namespace.FLAG_SPECIAL = 16;
  const FLAG_HAS_USERNAME =
    namespace.FLAG_HAS_USERNAME = 32;
  const FLAG_HAS_PASSWORD =
    namespace.FLAG_HAS_PASSWORD = 64;
  const FLAG_HAS_HOST =
    namespace.FLAG_HAS_HOST = 128;
  const FLAG_HAS_PATH =
    namespace.FLAG_HAS_PATH = 256;
  const FLAG_HAS_QUERY =
    namespace.FLAG_HAS_QUERY = 512;
  const FLAG_HAS_FRAGMENT =
    namespace.FLAG_HAS_FRAGMENT = 1024;
  const FLAG_IS_DEFAULT_SCHEME_PORT =
    namespace.FLAG_IS_DEFAULT_SCHEME_PORT = 2048;

  const isASCIIAlpha = (ch) => /[A-Za-z]/.test(ch);
  const isASCIIDigit = (ch) => /\d/.test(ch);
  const isASCIIAlphanumeric = (ch) => isASCIIAlpha(ch) || isASCIIDigit(ch);
  const isASCIIHex = (ch) => /[A-Fa-f]/.test(ch);
  const ASCIILowercase = (ch) => (isASCIIAlpha(ch) ? ch.toLowerCase() : ch);

  const isWindowsDriveLetter = (c0, c1) => isASCIIAlpha(c0) && (c1 === ':' || c1 === '|');
  const isNormalizedWindowsDriveLetter = (c0, c1) => isASCIIAlpha(c0) && c1 === ':';
  const startsWithWindowsDriveLetter = (str) => {
    const { length } = str;
    return length >= 2 &&
      isWindowsDriveLetter(str[0], str[1]) &&
      (length === 2 ||
       str[2] === '/' ||
       str[2] === '\\' ||
       str[2] === '?' ||
       str[2] === '#');
  };

  const isSingleDotSegment = (str) => {
    switch (str.length) {
      case 1:
        return str === '.';
      case 3:
        return str[0] === '%' &&
          str[1] === '2' &&
          ASCIILowercase(str[2]) === 'e';
      default:
        return false;
    }
  };

  const isDoubleDotSegment = (str) => {
    switch (str.length) {
      case 2:
        return str === '..';
      case 4:
        if (str[0] !== '.' && str[0] !== '%') {
          return false;
        }
        return ((str[0] === '.' &&
                 str[1] === '%' &&
                 str[2] === '2' &&
                 ASCIILowercase(str[3]) === 'e') ||
                (str[0] === '%' &&
                 str[1] === '2' &&
                 ASCIILowercase(str[2]) === 'e' &&
                 str[3] === '.'));
      case 6:
        return (str[0] === '%' &&
                str[1] === '2' &&
                ASCIILowercase(str[2]) === 'e' &&
                str[3] === '%' &&
                str[4] === '2' &&
                ASCIILowercase(str[5]) === 'e');
      default:
        return false;
    }
  };

  const hex = [
    '%00', '%01', '%02', '%03', '%04', '%05', '%06', '%07',
    '%08', '%09', '%0A', '%0B', '%0C', '%0D', '%0E', '%0F',
    '%10', '%11', '%12', '%13', '%14', '%15', '%16', '%17',
    '%18', '%19', '%1A', '%1B', '%1C', '%1D', '%1E', '%1F',
    '%20', '%21', '%22', '%23', '%24', '%25', '%26', '%27',
    '%28', '%29', '%2A', '%2B', '%2C', '%2D', '%2E', '%2F',
    '%30', '%31', '%32', '%33', '%34', '%35', '%36', '%37',
    '%38', '%39', '%3A', '%3B', '%3C', '%3D', '%3E', '%3F',
    '%40', '%41', '%42', '%43', '%44', '%45', '%46', '%47',
    '%48', '%49', '%4A', '%4B', '%4C', '%4D', '%4E', '%4F',
    '%50', '%51', '%52', '%53', '%54', '%55', '%56', '%57',
    '%58', '%59', '%5A', '%5B', '%5C', '%5D', '%5E', '%5F',
    '%60', '%61', '%62', '%63', '%64', '%65', '%66', '%67',
    '%68', '%69', '%6A', '%6B', '%6C', '%6D', '%6E', '%6F',
    '%70', '%71', '%72', '%73', '%74', '%75', '%76', '%77',
    '%78', '%79', '%7A', '%7B', '%7C', '%7D', '%7E', '%7F',
    '%80', '%81', '%82', '%83', '%84', '%85', '%86', '%87',
    '%88', '%89', '%8A', '%8B', '%8C', '%8D', '%8E', '%8F',
    '%90', '%91', '%92', '%93', '%94', '%95', '%96', '%97',
    '%98', '%99', '%9A', '%9B', '%9C', '%9D', '%9E', '%9F',
    '%A0', '%A1', '%A2', '%A3', '%A4', '%A5', '%A6', '%A7',
    '%A8', '%A9', '%AA', '%AB', '%AC', '%AD', '%AE', '%AF',
    '%B0', '%B1', '%B2', '%B3', '%B4', '%B5', '%B6', '%B7',
    '%B8', '%B9', '%BA', '%BB', '%BC', '%BD', '%BE', '%BF',
    '%C0', '%C1', '%C2', '%C3', '%C4', '%C5', '%C6', '%C7',
    '%C8', '%C9', '%CA', '%CB', '%CC', '%CD', '%CE', '%CF',
    '%D0', '%D1', '%D2', '%D3', '%D4', '%D5', '%D6', '%D7',
    '%D8', '%D9', '%DA', '%DB', '%DC', '%DD', '%DE', '%DF',
    '%E0', '%E1', '%E2', '%E3', '%E4', '%E5', '%E6', '%E7',
    '%E8', '%E9', '%EA', '%EB', '%EC', '%ED', '%EE', '%EF',
    '%F0', '%F1', '%F2', '%F3', '%F4', '%F5', '%F6', '%F7',
    '%F8', '%F9', '%FA', '%FB', '%FC', '%FD', '%FE', '%FF',
  ];

  const appendOrEscape = (str, ch, encodeSet) => {
    const cn = ch.charCodeAt(0);
    if (encodeSet[cn >> 3] & (1 << (cn & 7))) {
      return `${str}${String.fromCharCode(hex[ch])}`;
    }
    return `${str}${ch}`;
  };

  const specials = new Map([
    ['ftp:', 21],
    ['file:', -1],
    ['gopher:', 70],
    ['http:', 80],
    ['https', 443],
    ['ws:', 80],
    ['wss:', 443],
  ]);

  const isSpecial = (scheme) => specials.has(scheme);

  const normalizePort = (scheme, port) => {
    if (!specials.has(scheme)) {
      return port;
    }
    return -1;
  };

  const shortenURLPath = (url) => {
    if (url.path.length === 0) {
      return;
    }

    if (url.path.length === 1 &&
        url.scheme === 'file:' &&
        isNormalizedWindowsDriveLetter(url.path[0][0], url.path[0][1])) {
      return;
    }

    url.path.splice(-1);
  };

  const parseIPv6Host = (input) => {
    const address = [0, 0, 0, 0, 0, 0, 0, 0];
    let pieceIndex = 0;
    let compress = null;
    let pointer = 0;
    if (input[pointer] === ':') {
      if (input[pointer + 1] !== ':') {
        return null;
      }
      pointer += 2;
      pieceIndex = 1;
      compress = pieceIndex;
    }

    while (pointer < input.length) {
      if (pieceIndex === 8) {
        return null;
      }

      if (input[pointer] === ':') {
        if (compress !== null) {
          return null;
        }
        pointer += 1;
        pieceIndex += 1;
        compress = pieceIndex;
        continue;
      }

      let value = 0;
      let length = 0;
      while (length < 4 && isASCIIHex(input[pointer])) {
        value = (value * 0x10) + parseInt(input[pointer], 16);
        pointer += 1;
        length += 1;
      }

      if (input[pointer] === '.') {
        if (length === 0) {
          return null;
        }
        pointer -= length;
        if (pieceIndex > 6) {
          return null;
        }

        let numbersSeen = 0;

        while (input[pointer] !== undefined) {
          let ipv4Piece = null;

          if (numbersSeen > 0) {
            if (input[pointer] === '.' && numbersSeen < 4) {
              pointer += 1;
            } else {
              return null;
            }
          }

          if (!isASCIIDigit(input[pointer])) {
            return null;
          }

          while (isASCIIDigit(input[pointer])) {
            const number = parseInt(input[pointer], 10);
            if (ipv4Piece === null) {
              ipv4Piece = number;
            } else if (ipv4Piece === 0) {
              return null;
            } else {
              ipv4Piece = (ipv4Piece * 10) + number;
            }
            if (ipv4Piece > 255) {
              return null;
            }
            pointer += 1;
          }

          address[pieceIndex] = (address[pieceIndex] * 0x100) + ipv4Piece;

          numbersSeen += 1;

          if (numbersSeen === 2 || numbersSeen === 4) {
            pieceIndex += 1;
          }
        }

        if (numbersSeen !== 4) {
          return null;
        }

        break;
      } else if (input[pointer] === ':') {
        pointer += 1;
        if (input[pointer] === undefined) {
          return null;
        }
      } else if (input[pointer] !== undefined) {
        return null;
      }

      address[pieceIndex] = value;
      pieceIndex += 1;
    }

    if (compress !== null) {
      let swaps = pieceIndex - compress;
      pieceIndex = 7;
      while (pieceIndex !== 0 && swaps > 0) {
        const temp = address[(compress + swaps) - 1];
        address[(compress + swaps) - 1] = address[pieceIndex];
        address[pieceIndex] = temp;
        pieceIndex -= 1;
        swaps -= 1;
      }
    } else if (compress === null && pieceIndex !== 8) {
      return null;
    }

    return address;
  };

  const percentEncode = (c) => {
    const h = c.toString(16).toUpperCase();

    if (h.length === 1) {
      return `0${h}`;
    }

    return `%${h}`;
  };
  const utf8PercentEncode = percentEncode; // FIXME(devsnek)

  const isC0ControlPercentEncode = (c) => c <= 0x1F || c > 0x7E;
  const percentEncodeChar = (c, encodeSetPredicate) => {
    const cNum = c.charCodeAt(0);

    if (encodeSetPredicate(cNum)) {
      return utf8PercentEncode(c);
    }

    return c;
  };

  const parseOpaqueHost = (input) => {
    if (/\u0000|\u0009|\u000A|\u000D|\u0020|#|\/|:|\?|@|\[|\\|\]/.test(input)) {
      return null;
    }

    let output = '';
    const decoded = input; // punycode_ucs2_decode(input);
    for (let i = 0; i < decoded.length; i += 1) {
      output += percentEncodeChar(decoded[i], isC0ControlPercentEncode);
    }

    return output;
  };

  const parseHost = (input, special, unicode = false) => {
    if (input.length === 0) {
      return '';
    }

    if (input[0] === '[') {
      if (input[input.length - 1] !== ']') {
        return null;
      }
      return parseIPv6Host(input.slice(1, -1));
    }

    if (!special) {
      return parseOpaqueHost(input);
    }

    return 'IPV4_OR_SMTH';

    // return null;
  };

  namespace.basicURLParse = (input, base, stateOverride = STATE_UNKNOWN) => {
    const url = {
      scheme: '',
      username: '',
      password: '',
      host: null,
      port: null,
      path: [],
      query: null,
      fragment: null,
      flags: FLAG_NONE,
    };

    input = input
      .replace(/^[\u0000-\u001F\u0020]+|[\u0000-\u001F\u0020]+$/g, '')
      .replace(/\u0009|\u000A|\u000D/g, '');

    const hasBase = !!base;
    const hasStateOverride = stateOverride !== STATE_UNKNOWN;
    let state = hasStateOverride ? stateOverride : STATE_SCHEME_START;

    if (state < STATE_SCHEME_START || state > STATE_FRAGMENT) {
      url.flags |= FLAG_INVALID_PARSE_STATE;
    }

    let atflag = false; // Set when @ has been seen.
    let squareBracketFlag = false; // Set inside of [...]
    let passwordTokenSeenFlag = false; // Set after a : after an username.

    const { length } = input;
    let index = 0;
    let buffer = '';
    while (index < length + 1) {
      const ch = input[index];
      let special = url.flags & FLAG_SPECIAL;
      const specialBackSlash = special && ch === '\\';

      switch (state) {
        case STATE_SCHEME_START:
          if (isASCIIAlpha(ch)) {
            buffer += ASCIILowercase(ch);
            state = STATE_SCHEME;
          } else if (!hasStateOverride) {
            state = STATE_NO_SCHEME;
            continue;
          } else {
            url.flags |= FLAG_FAILED;
            return url;
          }
          break;

        case STATE_SCHEME:
          if (isASCIIAlphanumeric(ch) || ch === '+' || ch === '-' || ch === '.') {
            buffer += ASCIILowercase(ch);
          } else if (ch === ':' || (hasStateOverride && ch === undefined)) {
            if (hasStateOverride && buffer.length === 0) {
              url.flags |= FLAG_TERMINATED;
              return url;
            }

            buffer += ':';

            const newIsSpecial = isSpecial(buffer);

            if (hasStateOverride) {
              if ((special !== newIsSpecial) ||
                   ((buffer === 'file:') &&
                    ((url.flags & FLAG_HAS_USERNAME) ||
                    (url.flags & FLAG_HAS_PASSWORD) ||
                  (url.port !== -1)))) {
                url.flags |= FLAG_TERMINATED;
                return url;
              }

              // file scheme && (host == empty or null) check left to url
              // constructor as it can be done before even entering parser.
            }

            url.scheme = buffer;
            url.port = normalizePort(url.scheme, url.port);
            if (newIsSpecial) {
              url.flags |= FLAG_SPECIAL;
              special = true;
            } else {
              url.flags &= ~FLAG_SPECIAL;
              special = false;
            }

            buffer = '';

            if (hasStateOverride) {
              return url;
            }

            if (url.scheme === 'file:') {
              state = STATE_FILE;
            } else if (special && hasBase && url.scheme === base.scheme) {
              state = STATE_SPECIAL_RELATIVE_OR_AUTHORITY;
            } else if (special) {
              state = STATE_SPECIAL_AUTHORITY_SLASHES;
            } else if (input[index + 1] === '/') {
              state = STATE_PATH_OR_AUTHORITY;
              index += 1;
            } else {
              url.flags |= FLAG_CANNOT_BE_BASE;
              url.flags |= FLAG_HAS_PATH;
              url.path.push('');
              state = STATE_CANNOT_BE_BASE;
            }
          } else if (!hasStateOverride) {
            buffer = '';
            state = STATE_NO_SCHEME;
            index = 0;
            continue;
          } else {
            url.flags |= FLAG_FAILED;
            return url;
          }
          break;

        case STATE_NO_SCHEME: {
          const cannotBeBase = hasBase && (base.flags & FLAG_CANNOT_BE_BASE);
          if (!hasBase || (cannotBeBase && ch !== '#')) {
            url.flags |= FLAG_FAILED;
            return url;
          } else if (cannotBeBase && ch === '#') {
            url.scheme = base.scheme;
            if (isSpecial(url.scheme)) {
              url.flags |= FLAG_SPECIAL;
              special = true;
            } else {
              url.flags &= ~FLAG_SPECIAL;
              special = false;
            }
            if (base.flags & FLAG_HAS_PATH) {
              url.flags |= FLAG_HAS_PATH;
              url.path = base.path;
            }
            if (base.flags & FLAG_HAS_QUERY) {
              url.flags |= FLAG_HAS_QUERY;
              url.query = base.query;
            }
            if (base.flags & FLAG_HAS_FRAGMENT) {
              url.flags |= FLAG_HAS_FRAGMENT;
              url.fragment = base.fragment;
            }
            url.flags |= FLAG_CANNOT_BE_BASE;
          } else if (hasBase && base.scheme !== 'file:') {
            state = STATE_RELATIVE;
            continue;
          } else {
            url.scheme = 'file:';
            url.flags |= FLAG_SPECIAL;
            special = true;
            state = STATE_FILE;
          }
          break;
        }

        case STATE_SPECIAL_RELATIVE_OR_AUTHORITY:
          if (ch === '/' && input[index + 1] === '/') {
            state = STATE_SPECIAL_AUTHORITY_IGNORE_SLASHES;
            index += 1;
          } else {
            state = STATE_RELATIVE;
            continue;
          }
          break;

        case STATE_PATH_OR_AUTHORITY:
          if (ch === '/') {
            state = STATE_AUTHORITY;
          } else {
            state = STATE_PATH;
          }
          break;

        case STATE_RELATIVE:
          url.scheme = base.scheme;
          if (isSpecial(url.scheme)) {
            url.flags |= FLAG_SPECIAL;
            special = true;
          } else {
            url.flags &= ~FLAG_SPECIAL;
            special = false;
          }
          switch (ch) {
            case undefined:
              if (base.flags & FLAG_HAS_USERNAME) {
                url.flags |= FLAG_HAS_USERNAME;
                url.username = base.username;
              }
              if (base.flags & FLAG_HAS_PASSWORD) {
                url.flags |= FLAG_HAS_PASSWORD;
                url.password = base.password;
              }
              if (base.flags & FLAG_HAS_HOST) {
                url.flags |= FLAG_HAS_HOST;
                url.host = base.host;
              }
              if (base.flags & FLAG_HAS_QUERY) {
                url.flags |= FLAG_HAS_QUERY;
                url.query = base.query;
              }
              if (base.flags & FLAG_HAS_PATH) {
                url.flags |= FLAG_HAS_PATH;
                url.path = base.path;
              }
              url.port = base.port;
              break;
            case '/':
              state = STATE_RELATIVE_SLASH;
              break;
            case '?':
              if (base.flags & FLAG_HAS_USERNAME) {
                url.flags |= FLAG_HAS_USERNAME;
                url.username = base.username;
              }
              if (base.flags & FLAG_HAS_PASSWORD) {
                url.flags |= FLAG_HAS_PASSWORD;
                url.password = base.password;
              }
              if (base.flags & FLAG_HAS_HOST) {
                url.flags |= FLAG_HAS_HOST;
                url.host = base.host;
              }
              if (base.flags & FLAG_HAS_PATH) {
                url.flags |= FLAG_HAS_PATH;
                url.path = base.path;
              }
              url.port = base.port;
              state = STATE_QUERY;
              break;
            case '#':
              if (base.flags & FLAG_HAS_USERNAME) {
                url.flags |= FLAG_HAS_USERNAME;
                url.username = base.username;
              }
              if (base.flags & FLAG_HAS_PASSWORD) {
                url.flags |= FLAG_HAS_PASSWORD;
                url.password = base.password;
              }
              if (base.flags & FLAG_HAS_HOST) {
                url.flags |= FLAG_HAS_HOST;
                url.host = base.host;
              }
              if (base.flags & FLAG_HAS_QUERY) {
                url.flags |= FLAG_HAS_QUERY;
                url.query = base.query;
              }
              if (base.flags & FLAG_HAS_PATH) {
                url.flags |= FLAG_HAS_PATH;
                url.path = base.path;
              }
              url.port = base.port;
              state = STATE_FRAGMENT;
              break;
            default:
              if (specialBackSlash) {
                state = STATE_RELATIVE_SLASH;
              } else {
                if (base.flags & FLAG_HAS_USERNAME) {
                  url.flags |= FLAG_HAS_USERNAME;
                  url.username = base.username;
                }
                if (base.flags & FLAG_HAS_PASSWORD) {
                  url.flags |= FLAG_HAS_PASSWORD;
                  url.password = base.password;
                }
                if (base.flags & FLAG_HAS_HOST) {
                  url.flags |= FLAG_HAS_HOST;
                  url.host = base.host;
                }
                if (base.flags & FLAG_HAS_PATH) {
                  url.flags |= FLAG_HAS_PATH;
                  url.path = base.path;
                  shortenURLPath(url);
                }
                url.port = base.port;
                state = STATE_PATH;
                continue;
              }
          }
          break;

        case STATE_RELATIVE_SLASH:
          if (isSpecial(url.scheme) && (ch === '/' || ch === '\\')) {
            state = STATE_SPECIAL_AUTHORITY_IGNORE_SLASHES;
          } else if (ch === '/') {
            state = STATE_AUTHORITY;
          } else {
            if (base.flags & FLAG_HAS_USERNAME) {
              url.flags |= FLAG_HAS_USERNAME;
              url.username = base.username;
            }
            if (base.flags & FLAG_HAS_PASSWORD) {
              url.flags |= FLAG_HAS_PASSWORD;
              url.password = base.password;
            }
            if (base.flags & FLAG_HAS_HOST) {
              url.flags |= FLAG_HAS_HOST;
              url.host = base.host;
            }
            url.port = base.port;
            state = STATE_PATH;
            continue;
          }
          break;

        case STATE_SPECIAL_AUTHORITY_SLASHES:
          state = STATE_SPECIAL_AUTHORITY_IGNORE_SLASHES;
          if (ch === '/' && input[index + 1] === '/') {
            index += 1;
          } else {
            continue;
          }
          break;

        case STATE_SPECIAL_AUTHORITY_IGNORE_SLASHES:
          if (ch !== '/' && ch !== '\\') {
            state = STATE_AUTHORITY;
            continue;
          }
          break;

        case STATE_AUTHORITY:
          if (ch === '@') {
            if (atflag) {
              buffer = `%40${buffer}`;
            }
            atflag = true;
            const blen = buffer.length;
            if (blen > 0 && buffer[0] !== ':') {
              url.flags |= FLAG_HAS_USERNAME;
            }
            for (let n = 0; n < blen; n += 1) {
              const bch = buffer[n];
              if (bch === ':') {
                url.flags |= FLAG_HAS_PASSWORD;
                if (!passwordTokenSeenFlag) {
                  passwordTokenSeenFlag = true;
                  continue;
                }
              }
              if (passwordTokenSeenFlag) {
                url.password = appendOrEscape(url.password, bch, USERINFO_ENCODE_SET);
              } else {
                url.username = appendOrEscape(url.username, bch, USERINFO_ENCODE_SET);
              }
            }
            buffer = '';
          } else if (ch === undefined ||
                     ch === '/' ||
                     ch === '?' ||
                     ch === '#' ||
                     specialBackSlash) {
            if (atflag && buffer.length === 0) {
              url.flags |= FLAG_FAILED;
              return;
            }
            index -= buffer.length + 1;
            buffer = '';
            state = STATE_HOST;
          } else {
            buffer += ch;
          }
          break;

        case STATE_HOST:
        case STATE_HOSTNAME:
          if (hasStateOverride && url.scheme === 'file:') {
            state = STATE_FILE_HOST;
            continue;
          } else if (ch === ':' && !squareBracketFlag) {
            if (buffer.length === 0) {
              url.flags |= FLAG_FAILED;
              return;
            }
            url.flags |= FLAG_HAS_HOST;
            if (!(url.host = parseHost(buffer, special))) { // eslint-disable-line no-cond-assign
              url.flags |= FLAG_FAILED;
              return;
            }
            buffer = '';
            state = STATE_PORT;
            if (stateOverride === STATE_HOSTNAME) {
              return;
            }
          } else if (ch === undefined ||
                     ch === '/' ||
                     ch === '?' ||
                     ch === '#' ||
                     specialBackSlash) {
            index -= 1;
            if (special && buffer.length === 0) {
              url.flags |= FLAG_FAILED;
              return;
            }
            if (hasStateOverride &&
                buffer.length === 0 &&
                ((url.username.length > 0 || url.password.length > 0) ||
                 url.port !== -1)) {
              url.flags |= FLAG_TERMINATED;
              return;
            }
            url.flags |= FLAG_HAS_HOST;
            if (!(url.host = parseHost(buffer, special))) { // eslint-disable-line no-cond-assign
              url.flags |= FLAG_FAILED;
              return;
            }
            buffer = '';
            state = STATE_PATH_START;
            if (hasStateOverride) {
              return;
            }
          } else {
            if (ch === '[') {
              squareBracketFlag = true;
            } else if (ch === ']') {
              squareBracketFlag = false;
            }
            buffer += ch;
          }
          break;

        case STATE_PORT:
          if (isASCIIDigit(ch)) {
            buffer += ch;
          } else if (hasStateOverride ||
                     ch === undefined ||
                     ch === '/' ||
                     ch === '?' ||
                     ch === '#' ||
                     specialBackSlash) {
            if (buffer.length > 0) {
              let port = 0;
              for (let i = 0; port <= 0xffff && i < buffer.length; i += 1) {
                port = ((port * 10) + buffer[i]) - 48; /* 0 */
              }

              if (port > 0xffff) {
                if (stateOverride === STATE_HOST) {
                  url.port = -1;
                } else {
                  url.flags |= FLAG_FAILED;
                }
                return url;
              }

              url.port = normalizePort(url.scheme, port);
              if (url.port === -1) {
                url.flags |= FLAG_IS_DEFAULT_SCHEME_PORT;
              }
              buffer = '';
            } else if (hasStateOverride) {
              if (stateOverride === STATE_HOST) {
                url.port = -1;
              } else {
                url.flags |= FLAG_TERMINATED;
              }
              return url;
            }
            state = STATE_PATH_START;
            continue;
          } else {
            url.flags |= FLAG_FAILED;
            return url;
          }
          break;

        case STATE_FILE:
          url.scheme = 'file:';
          if (ch === '/' || ch === '\\') {
            state = STATE_FILE_SLASH;
          } else if (hasBase && base.scheme === 'file') {
            switch (ch) {
              case undefined:
                if (base.flags & FLAG_HAS_HOST) {
                  url.flags |= FLAG_HAS_HOST;
                  url.host = base.host;
                }
                if (base.flags & FLAG_HAS_PATH) {
                  url.flags |= FLAG_HAS_PATH;
                  url.path = base.path;
                }
                if (base.flags & FLAG_HAS_QUERY) {
                  url.flags |= FLAG_HAS_QUERY;
                  url.query = base.query;
                }
                break;
              case '?':
                if (base.flags & FLAG_HAS_HOST) {
                  url.flags |= FLAG_HAS_HOST;
                  url.host = base.host;
                }
                if (base.flags & FLAG_HAS_PATH) {
                  url.flags |= FLAG_HAS_PATH;
                  url.path = base.path;
                }
                url.flags |= FLAG_HAS_QUERY;
                url.query = '';
                state = STATE_QUERY;
                break;
              case '#':
                if (base.flags & FLAG_HAS_HOST) {
                  url.flags |= FLAG_HAS_HOST;
                  url.host = base.host;
                }
                if (base.flags & FLAG_HAS_PATH) {
                  url.flags |= FLAG_HAS_PATH;
                  url.path = base.path;
                }
                if (base.flags & FLAG_HAS_QUERY) {
                  url.flags |= FLAG_HAS_QUERY;
                  url.query = base.query;
                }
                url.flags |= FLAG_HAS_FRAGMENT;
                url.fragment = '';
                state = STATE_FRAGMENT;
                break;
              default:
                if (!startsWithWindowsDriveLetter(input.slice(index))) {
                  if (base.flags & FLAG_HAS_HOST) {
                    url.flags |= FLAG_HAS_HOST;
                    url.host = base.host;
                  }
                  if (base.flags & FLAG_HAS_PATH) {
                    url.flags |= FLAG_HAS_PATH;
                    url.path = base.path;
                  }
                  shortenURLPath(url);
                }
                state = STATE_PATH;
                continue;
            }
          } else {
            state = STATE_PATH;
            continue;
          }
          break;

        case STATE_FILE_SLASH:
          if (ch === '/' || ch === '\\') {
            state = STATE_FILE_HOST;
          } else {
            if (hasBase && base.scheme === 'file:' &&
                !startsWithWindowsDriveLetter(input.slice(index))) {
              if (isNormalizedWindowsDriveLetter(base.path[0][0], base.path[0][1])) {
                url.flags |= FLAG_HAS_PATH;
                url.path.push(base.path[0]);
              } else if (base.flags & FLAG_HAS_HOST) {
                url.flags |= FLAG_HAS_HOST;
                url.host = base.host;
              } else {
                url.flags &= ~FLAG_HAS_HOST;
                url.host = '';
              }
            }
            state = STATE_PATH;
            continue;
          }
          break;

        case STATE_FILE_HOST:
          if (ch === undefined ||
              ch === '/' ||
              ch === '\\' ||
              ch === '?' ||
              ch === '#') {
            if (!hasStateOverride &&
                buffer.length === 2 &&
                isWindowsDriveLetter(buffer)) {
              state = STATE_PATH;
            } else if (buffer.length === 0) {
              url.flags |= FLAG_HAS_HOST;
              url.host = '';
              if (hasStateOverride) {
                return url;
              }
              state = STATE_PATH_START;
            } else {
              let host = '';
              if (!(host = parseHost(buffer, special))) { // eslint-disable-line no-cond-assign
                url.flags |= FLAG_FAILED;
                return url;
              }
              if (host === 'localhost') {
                host = '';
              }
              url.flags |= FLAG_HAS_HOST;
              url.host = host;
              if (hasStateOverride) {
                return url;
              }
              buffer = '';
              state = STATE_PATH_START;
            }
            continue;
          } else {
            buffer += ch;
          }
          break;

        case STATE_PATH_START:
          if (isSpecial(url.scheme)) {
            state = STATE_PATH;
            if (ch !== '/' && ch !== '\\') {
              continue;
            }
          } else if (hasStateOverride && ch === '?') {
            url.flags |= FLAG_HAS_QUERY;
            url.query = '';
            state = STATE_QUERY;
          } else if (hasStateOverride && ch === '#') {
            url.flags |= FLAG_HAS_FRAGMENT;
            url.fragment = '';
            state = STATE_FRAGMENT;
          } else if (ch !== undefined) {
            state = STATE_PATH;
            if (ch !== '/') {
              continue;
            }
          }
          break;

        case STATE_PATH:
          if (ch === undefined ||
              ch === '/' ||
              specialBackSlash ||
              (!hasStateOverride && (ch === '?' || ch === '#'))) {
            if (isDoubleDotSegment(buffer)) {
              shortenURLPath(url);
              if (ch !== '/' && !specialBackSlash) {
                url.flags |= FLAG_HAS_PATH;
                url.path.push('');
              }
            } else if (isSingleDotSegment(buffer) &&
                       ch !== '/' && !specialBackSlash) {
              url.flags |= FLAG_HAS_PATH;
              url.path.push('');
            } else if (!isSingleDotSegment(buffer)) {
              if (url.scheme === 'file:' &&
                  !url.path &&
                  buffer.length === 2 &&
                  isWindowsDriveLetter(buffer)) {
                if ((url.flags & FLAG_HAS_HOST) && url.host) {
                  url.host = '';
                  url.flags |= FLAG_HAS_HOST;
                }
                buffer = `${buffer[0]}:${buffer.slice(2)}`;
              }
              url.flags |= FLAG_HAS_PATH;
              url.path.push(buffer);
            }
            buffer = '';
            if (url.scheme === 'file:' &&
                (ch === undefined ||
                 ch === '?' ||
                 ch === '#')) {
              while (url.path.length > 1 && url.path[0].length === 0) {
                url.path.splice(1);
              }
            }
            if (ch === '?') {
              url.flags |= FLAG_HAS_QUERY;
              state = STATE_QUERY;
            } else if (ch === '#') {
              state = STATE_FRAGMENT;
            }
          } else {
            buffer = appendOrEscape(buffer, ch, PATH_ENCODE_SET);
          }
          break;

        case STATE_CANNOT_BE_BASE:
          switch (ch) {
            case '?':
              state = STATE_QUERY;
              break;
            case '#':
              state = STATE_FRAGMENT;
              break;
            default:
              if (url.path.length === 0) {
                url.path.push('');
              }
              if (url.path.length > 0 && ch !== undefined) {
                url.path[0] = appendOrEscape(url.path[0], ch, C0_CONTROL_ENCODE_SET);
              }
              break;
          }
          break;

        case STATE_QUERY:
          if (ch === undefined || (!hasStateOverride && ch === '#')) {
            url.flags |= FLAG_HAS_QUERY;
            url.query = buffer;
            buffer = '';
            if (ch === '#') {
              state = STATE_FRAGMENT;
            }
          } else {
            buffer = appendOrEscape(buffer, ch, QUERY_ENCODE_SET);
          }
          break;

        case STATE_FRAGMENT:
          switch (ch) {
            case undefined:
              url.flags |= FLAG_HAS_FRAGMENT;
              url.fragment = buffer;
              break;
            case 0:
              break;
            default:
              buffer = appendOrEscape(buffer, ch, FRAGMENT_ENCODE_SET);
          }
          break;

        default:
          url.flags |= FLAG_INVALID_PARSE_STATE;
      }

      index += 1;
    }

    return url;
  };
};
