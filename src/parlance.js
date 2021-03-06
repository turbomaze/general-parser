// Parlance
// @author Anthony Liu
// @date 2016/08/21

// config
var DEBUG = false;

function Parser(grammar, structure) {
  this.grammar = getRulesFromEbnf(grammar);
  this.structure = structure;
}
Parser.prototype.parse = function(goal, tokens) {
  return parse(this.grammar, this.structure, goal, tokens);
};

function getRuleFromExpansion(expansion) {
	if (typeof expansion === 'function') return expansion;

	expansion = expansion.replace(/\s+/g, '');

  if (expansion.indexOf('|') !== -1) {
		// or
    var orArguments = expansion.split('|');
    var components = orArguments.map(function(ebnfRule) {
			return getRuleFromExpansion(ebnfRule);
		});
    return {'or': components};
  } else if (expansion.indexOf(',') !== -1) {
		// and
    var andArguments = expansion.split(',');
    var components = andArguments.map(function(ebnfRule) {
			return getRuleFromExpansion(ebnfRule);
		});
    return {'and': components};
  } else if (expansion.indexOf('+') === expansion.length - 1) {
		// repeat at least once
    var ebnfRule = expansion.substring(0, expansion.length - 1);
    return {'repeat': [1, 100, ebnfRule]};
  } else if (
      expansion.indexOf('{') === 0 &&
      expansion.indexOf('}') === expansion.length - 1
  ) {
		// repeat optionally
    var ebnfRule = expansion.substring(1, expansion.length - 1);
    return {'repeat': [0, 100, ebnfRule]};
  } else if (
      expansion.indexOf('[') === 0 &&
      expansion.indexOf(']') === expansion.length - 1
  ) {
		// optional
    var ebnfRule = expansion.substring(1, expansion.length - 1);
    return {'repeat': [0, 1, ebnfRule]};
  }

  return expansion;
}

function getRulesFromEbnf(ebnf) {
  var rules = {};
  for (var ruleName in ebnf) {
    rules[ruleName] = getRuleFromExpansion(ebnf[ruleName]);
  }
  return rules;
}

function parse(rules, structures, goal, tokens) {
  var ret = {};
  var info = {}; 
  var conformsToRule = ruleApplies(rules, structures, goal, tokens, ret, info);
  if (conformsToRule && ret.newTokens.length === 0) {
    return ret.structure;
  } else {
    throw {
      message: 'SYNTAX ERROR: error parsing string.',
      data: info
    };
  }
}

function ruleApplies(rules, structures, rule, tokens, ret, info) {
  var struct = typeof rule === 'string' ? rules[rule] : rule;

  // apply the rule
  var applies = false;
  switch (typeof struct) {
    case 'function':
      applies = struct(tokens, ret);
      if (ret.structure) {
        if ('tokens' in info) {
          if (info.tokens.length > ret.newTokens.length) {
            info.tokens = ret.newTokens;
          }
        } else {
          info.tokens = ret.newTokens;
        }
      }
      break;
    case 'object':
      var builtIn = Object.keys(struct);
      if (builtIn.length > 0) {
        applies = applyBuiltIn(rules, structures, builtIn[0], struct[builtIn[0]], tokens, ret, info);
      }
      break;
    case 'string':
      applies = ruleApplies(rules, structures, struct, tokens, ret, info);
      break;
  }

  // apply the structural transformation
  if (applies && typeof rule === 'string') {
    var transform = structures[rule];

    if (typeof transform === 'object') transform = transform[ret.which];

    if (typeof transform !== 'function') transform = identity;

    ret.structure = transform.call(this, ret.structure);
  }

  if (applies && DEBUG) console.log(rule, ':', JSON.stringify(tokens), JSON.stringify(ret.structure));

  return applies;
}

function applyBuiltIn(rules, structures, type, components, tokens, ret, info) {
  var tempTokens = tokens.slice(0);
  ret.newTokens = tokens.slice(0);
  var doubleRet = {};
  var structureList = [];
  switch (type) {
    case 'or':
      for (var i = 0; i < components.length; i++) {
        if (ruleApplies(rules, structures, components[i], tokens, ret, info)) {
          ret.which = i;
          return true;
        }
      }
      return false;
    case 'and':
      for (var i = 0; i < components.length; i++) {
        if (ruleApplies(rules, structures, components[i], tempTokens, doubleRet, info)) {
          tempTokens = doubleRet.newTokens;
          structureList.push(doubleRet.structure);
        } else return false;
      }
      ret.newTokens = tempTokens;
      ret.structure = structureList;
      return true;
    case 'repeat':
      if (components.length !== 3) return false;
      
      var min = components[0], max = components[1], rule = components[2];
      for (var counter = 0; counter < max; counter++) {
        if (ruleApplies(rules, structures, rule, tempTokens, doubleRet, info)) {
          tempTokens = doubleRet.newTokens;
          structureList.push(doubleRet.structure);
        } else break;
      }

      if (counter >= min) {
        ret.newTokens = tempTokens;
        ret.structure = structureList;
        return true;
      }
  }

  return false;
}

function identity(a) {
  return a;
}

module.exports = function(grammar, structure) {
  return new Parser(grammar, structure);
};
