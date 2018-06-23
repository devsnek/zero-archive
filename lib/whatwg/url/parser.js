'use strict';

// https://github.com/nodejs/node/blob/master/src/node_url.cc

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
  const STATE_SCHEME_START =
    namespace.STATE_SCHEME_START = 0;
  const STATE_SCHEME = 1;
  const STATE_NO_SCHEME = 2;
  const STATE_SPECIAL_RELATIVE_OR_AUTHORITY = 3;
  const STATE_PATH_OR_AUTHORITY = 4;
  const STATE_RELATIVE = 5;
  const STATE_RELATIVE_SLASH = 6;
  const STATE_SPECIAL_AUTHORITY_SLASHES = 7;
  const STATE_SPECIAL_AUTHORITY_IGNORE_SLASHES = 8;
  const STATE_AUTHORITY =
    namespace.STATE_AUTHORITY = 9;
  const STATE_HOST =
    namespace.STATE_HOST = 10;
  const STATE_HOSTNAME =
    namespace.STATE_HOSTNAME = 11;
  const STATE_PORT =
    namespace.STATE_PORT = 12;
  const STATE_FILE = 13;
  const STATE_FILE_SLASH = 14;
  const STATE_FILE_HOST = 15;
  const STATE_PATH_START =
    namespace.STATE_PATH_START = 16;
  const STATE_PATH = 17;
  const STATE_CANNOT_BE_BASE = 18;
  const STATE_QUERY = 19;
  const STATE_FRAGMENT =
    namespace.STATE_FRAGMENT = 20;

  const isASCIIAlpha = (ch) => ch && /[A-Za-z]/.test(ch);
  const isASCIIDigit = (ch) => ch && /\d/.test(ch);
  const isASCIIAlphanumeric = (ch) => ch && (isASCIIAlpha(ch) || isASCIIDigit(ch));
  const isASCIIHex = (ch) => ch && (isASCIIDigit(ch) || /[A-Fa-f]/.test(ch));
  const ASCIILowercase = (ch) => (isASCIIAlpha(ch) ? ch.toLowerCase() : ch);

  const isWindowsDriveLetter = (str) => isASCIIAlpha(str[0]) && (str[1] === ':' || str[1] === '|');
  const isNormalizedWindowsDriveLetter = (str) => isASCIIAlpha(str[0]) && str[1] === ':';
  const startsWithWindowsDriveLetter = (str) => {
    const { length } = str;
    return length >= 2 &&
      isWindowsDriveLetter(str) &&
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
    ['https:', 443],
    ['ws:', 80],
    ['wss:', 443],
  ]);

  const isSpecial = (scheme) => specials.has(scheme);

  const normalizePort = (scheme, port) => {
    const p = specials.get(scheme);
    if (p && p === port) {
      return null;
    }
    return port;
  };

  const shortenURLPath = (url) => {
    if (url.path.length === 0) {
      return;
    }

    if (url.path.length === 1 &&
        url.scheme === 'file:' &&
        isNormalizedWindowsDriveLetter(url.path[0])) {
      return;
    }

    url.path.pop();
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
      pieceIndex += 1;
      compress = pieceIndex;
    }

    while (input[pointer]) {
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

        while (input[pointer]) {
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
        const t = address[pieceIndex];
        address[pieceIndex] = address[(compress + swaps) - 1];
        address[(compress + swaps) - 1] = t;
        pieceIndex -= 1;
        swaps -= 1;
      }
    } else if (compress === null && pieceIndex !== 8) {
      return null;
    }

    return address;
  };

  const parseIPv4Number = (input) => {
    let R = 10;

    if (input.length >= 2 && input.charAt(0) === '0' && input.charAt(1).toLowerCase() === 'x') {
      input = input.substring(2);
      R = 16;
    } else if (input.length >= 2 && input.charAt(0) === '0') {
      input = input.substring(1);
      R = 8;
    }

    if (input === '') {
      return 0;
    }

    let regex = /[^0-7]/;
    if (R === 10) {
      regex = /[^0-9]/;
    }
    if (R === 16) {
      regex = /[^0-9A-Fa-f]/;
    }

    if (regex.test(input)) {
      return null;
    }

    return parseInt(input, R);
  };

  const parseIPv4 = (input) => {
    const parts = input.split('.');
    if (parts[parts.length - 1] === '') {
      if (parts.length > 1) {
        parts.pop();
      }
    }

    if (parts.length > 4) {
      return input;
    }

    const numbers = [];
    for (const part of parts) {
      if (part === '') {
        return input;
      }
      const n = parseIPv4Number(part);
      if (n === null) {
        return input;
      }

      numbers.push(n);
    }

    for (let i = 0; i < numbers.length - 1; i += 1) {
      if (numbers[i] > 255) {
        return null;
      }
    }
    if (numbers[numbers.length - 1] >= 256 ** (5 - numbers.length)) {
      return null;
    }

    let ipv4 = numbers.pop();
    let counter = 0;

    for (const n of numbers) {
      ipv4 += n * (256 ** (3 - counter));
      counter += 1;
    }

    return ipv4;
  };

  const percentEncode = (c) => {
    const h = c.toString(16).toUpperCase();

    if (h.length === 1) {
      return `0${h}`;
    }

    return `%${h}`;
  };
  const utf8PercentEncode = percentEncode; // TODO(devsnek)

  const isC0ControlPercentEncode = (c) => c <= 0x1F || c > 0x7E;
  const percentEncodeChar = (c, encodeSetPredicate) => {
    const cNum = c.charCodeAt(0);

    if (encodeSetPredicate(cNum)) {
      return utf8PercentEncode(c);
    }

    return c;
  };

  const percentDecode = (str) => str; // TODO(devsnek)
  const toASCII = (str) => str; // TODO(devsnek)

  const containsForbiddenHostCodePoint = (str) =>
    /\u0000|\u0009|\u000A|\u000D|\u0020|#|\/|:|\?|@|\[|\\|\]/.test(str);

  const parseOpaqueHost = (input) => {
    if (containsForbiddenHostCodePoint(input)) {
      return null;
    }

    let output = '';
    const decoded = input; // punycode_ucs2_decode(input);
    for (let i = 0; i < decoded.length; i += 1) {
      output += percentEncodeChar(decoded[i], isC0ControlPercentEncode);
    }

    return output;
  };

  const parseHost = (input, special) => {
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

    const domain = percentDecode(input);
    const asciiDomain = toASCII(domain);

    if (!asciiDomain) {
      return null;
    }

    if (containsForbiddenHostCodePoint(asciiDomain)) {
      return null;
    }

    const ipv4Host = parseIPv4(asciiDomain);
    if (typeof ipv4Host === 'number' || !ipv4Host) {
      return ipv4Host;
    }

    return asciiDomain;
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

      // flags
      hasUsername: false,
      hasPassword: false,
      failed: false,
      invalid: false,
      special: false,
      cannotBeBase: false,
      isDefaultSchemePort: true,
    };

    input = input
      .replace(/^[\u0000-\u001F\u0020]+|[\u0000-\u001F\u0020]+$/g, '')
      .replace(/\u0009|\u000A|\u000D/g, '');

    const hasBase = !!base;
    const hasStateOverride = stateOverride !== STATE_UNKNOWN;
    let state = hasStateOverride ? stateOverride : STATE_SCHEME_START;

    if (state < STATE_SCHEME_START || state > STATE_FRAGMENT) {
      url.invalid = true;
    }

    let atflag = false; // Set when @ has been seen.
    let squareBracketFlag = false; // Set inside of [...]
    let passwordTokenSeenFlag = false; // Set after a : after an username.

    const { length } = input;
    let index = 0;
    let buffer = '';
    while (index < length + 1) {
      const ch = input[index];
      let { special } = url;
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
            url.failed = true;
            return url;
          }
          break;

        case STATE_SCHEME:
          if (isASCIIAlphanumeric(ch) || ch === '+' || ch === '-' || ch === '.') {
            buffer += ASCIILowercase(ch);
          } else if (ch === ':' || (hasStateOverride && ch === undefined)) {
            if (hasStateOverride && buffer.length === 0) {
              url.terminated = true;
              return url;
            }

            buffer += ':';

            const newIsSpecial = isSpecial(buffer);

            if (hasStateOverride) {
              if ((special !== newIsSpecial) ||
                   ((buffer === 'file:') &&
                    (url.hasUsername || url.hasPassword ||
                  (url.port !== null)))) {
                url.terminated = true;
                return url;
              }

              // file scheme && (host == empty or null) check left to url
              // constructor as it can be done before even entering parser.
            }

            url.scheme = buffer;
            url.port = normalizePort(url.scheme, url.port);
            if (newIsSpecial) {
              url.special = true;
              special = true;
            } else {
              url.special = false;
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
              url.cannotBeBase = true;
              url.path.push('');
              state = STATE_CANNOT_BE_BASE;
            }
          } else if (!hasStateOverride) {
            buffer = '';
            state = STATE_NO_SCHEME;
            index = 0;
            continue;
          } else {
            url.failed = true;
            return url;
          }
          break;

        case STATE_NO_SCHEME: {
          const cannotBeBase = hasBase && base.cannotBeBase;
          if (!hasBase || (cannotBeBase && ch !== '#')) {
            url.failed = true;
            return url;
          }

          if (cannotBeBase && ch === '#') {
            url.scheme = base.scheme;
            url.path = base.path.slice();
            url.query = base.query;
            url.fragment = '';
            url.cannotBeBase = true;
            state = STATE_FRAGMENT;
            if (isSpecial(url.scheme)) {
              url.special = true;
              special = true;
            } else {
              url.special = false;
              special = false;
            }
          } else if (hasBase && base.scheme !== 'file:') {
            state = STATE_RELATIVE;
            continue;
          } else {
            url.scheme = 'file:';
            url.special = true;
            special = true;
            state = STATE_FILE;
            continue;
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
            url.special = true;
            special = true;
          } else {
            url.special = false;
            special = false;
          }
          switch (ch) {
            case undefined:
              url.username = base.username;
              url.password = base.password;
              url.host = base.host;
              url.port = base.port;
              url.path = base.path.slice();
              url.query = base.query;
              break;
            case '/':
              state = STATE_RELATIVE_SLASH;
              break;
            case '?':
              url.username = base.username;
              url.password = base.password;
              url.host = base.host;
              url.port = base.port;
              url.path = base.path.slice();
              url.query = '';
              state = STATE_QUERY;
              break;
            case '#':
              url.username = base.username;
              url.password = base.password;
              url.host = base.host;
              url.port = base.port;
              url.path = base.path.slice();
              url.query = base.query;
              url.fragment = '';
              state = STATE_FRAGMENT;
              break;
            default:
              if (specialBackSlash) {
                state = STATE_RELATIVE_SLASH;
              } else {
                url.username = base.username;
                url.password = base.password;
                url.host = base.host;
                url.port = base.port;
                url.path = base.path.slice(0, base.path.length - 1);
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
            url.username = base.username;
            url.password = base.password;
            url.host = base.host;
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
            for (let n = 0; n < blen; n += 1) {
              const bch = buffer[n];
              if (bch === ':') {
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
              url.failed = true;
              return url;
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
              url.failed = true;
              return url;
            }
            url.host = parseHost(buffer, special);
            if (url.host === null) {
              url.failed = true;
              return url;
            }
            buffer = '';
            state = STATE_PORT;
            if (stateOverride === STATE_HOSTNAME) {
              return url;
            }
          } else if (ch === undefined ||
                     ch === '/' ||
                     ch === '?' ||
                     ch === '#' ||
                     specialBackSlash) {
            index -= 1;
            if (special && buffer.length === 0) {
              url.failed = true;
              return url;
            }
            if (hasStateOverride &&
                buffer.length === 0 &&
                ((url.username.length > 0 || url.password.length > 0) ||
                 url.port !== null)) {
              url.terminated = true;
              return url;
            }
            url.host = parseHost(buffer, special);
            if (url.host === null) {
              url.failed = true;
              return url;
            }
            buffer = '';
            state = STATE_PATH_START;
            if (hasStateOverride) {
              return url;
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
              const port = parseInt(buffer, 10);
              if (port > 0xffff) {
                if (stateOverride === STATE_HOST) {
                  url.port = null;
                } else {
                  url.failed = true;
                }
                return url;
              }

              url.port = normalizePort(url.scheme, port);
              if (url.port === null) {
                url.isDefaultSchemePort = true;
              }
              buffer = '';
            } else if (hasStateOverride) {
              if (stateOverride === STATE_HOST) {
                url.port = null;
              } else {
                url.terminated = true;
              }
              return url;
            }
            state = STATE_PATH_START;
            continue;
          } else {
            url.failed = true;
            return url;
          }
          break;

        case STATE_FILE:
          url.scheme = 'file:';
          if (ch === '/' || ch === '\\') {
            state = STATE_FILE_SLASH;
          } else if (hasBase && base.scheme === 'file:') {
            switch (ch) {
              case undefined:
                url.host = base.host;
                url.path = base.path.slice();
                url.query = base.query;
                break;
              case '?':
                url.host = base.host;
                url.path = base.path.slice();
                url.query = '';
                state = STATE_QUERY;
                break;
              case '#':
                url.host = base.host;
                url.path = base.path.slice();
                url.query = base.query;
                url.fragment = '';
                state = STATE_FRAGMENT;
                break;
              default:
                if (!startsWithWindowsDriveLetter(input.slice(index))) {
                  url.host = base.host;
                  url.path = base.path.slice();
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
              if (isNormalizedWindowsDriveLetter(base.path[0])) {
                url.path.push(base.path[0]);
              } else {
                url.host = base.host;
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
              url.host = '';
              if (hasStateOverride) {
                return url;
              }
              state = STATE_PATH_START;
            } else {
              let host = parseHost(buffer, special);
              if (host === null) {
                url.failed = true;
                return url;
              }
              if (host === 'localhost') {
                host = '';
              }
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
          } else if (!hasStateOverride && ch === '?') {
            url.query = '';
            state = STATE_QUERY;
          } else if (!hasStateOverride && ch === '#') {
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
                url.path.push('');
              }
            } else if (isSingleDotSegment(buffer) &&
                       ch !== '/' && !specialBackSlash) {
              url.path.push('');
            } else if (!isSingleDotSegment(buffer)) {
              if (url.scheme === 'file:' &&
                  url.path.length === 0 &&
                  buffer.length === 2 &&
                  isWindowsDriveLetter(buffer)) {
                if (url.host) {
                  url.host = '';
                }
                buffer = `${buffer[0]}:`;
              }
              url.path.push(buffer);
            }
            buffer = '';
            if (url.scheme === 'file:' &&
                (ch === undefined ||
                 ch === '?' ||
                 ch === '#')) {
              while (url.path.length > 1 && url.path[0].length === 0) {
                url.path = url.path.splice(1);
              }
            }
            if (ch === '?') {
              url.query = '';
              state = STATE_QUERY;
            } else if (ch === '#') {
              url.fragment = '';
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
              url.fragment = buffer;
              break;
            case 0:
              break;
            default:
              buffer = appendOrEscape(buffer, ch, FRAGMENT_ENCODE_SET);
          }
          break;

        default:
          url.invalid = true;
      }

      index += 1;
    }

    return url;
  };
};
