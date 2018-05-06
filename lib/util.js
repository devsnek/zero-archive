'use strict';

({ binding, namespace, load }) => {
  const ScriptWrap = binding('script_wrap');

  Object.assign(namespace, ScriptWrap.run('[NativeSyntax]', `
({
  PrivateSymbol: (name) => %CreatePrivateSymbol(name),
  __proto__: null,
});
`));

  Object.assign(namespace, load('util/inspect'));
};
