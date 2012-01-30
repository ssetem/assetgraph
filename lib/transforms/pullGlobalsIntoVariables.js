var _ = require('underscore'),
    uglifyJs = require('uglify-js');

module.exports = function (queryObj, globalNames, wrapInFunction) {
    globalNames = globalNames || ['eval', 'clearInterval', 'clearTimeout', 'document', 'event', 'frames', 'history', 'Image', 'localStorage', 'location', 'name', 'navigator', 'Option', 'parent', 'screen', 'sessionStorage', 'setInterval', 'setTimeout', 'Storage', 'window', 'XMLHttpRequest', 'Math', 'Math.min', 'Math.max', 'Math.round', 'Function', 'Date', 'Date.prototype', 'Math.E', 'Math.LN2', 'Math.LN10', 'Math.LOG2E', 'Math.LOG10E', 'Math.PI', 'Math.SQRT1_2', 'Math.SQRT2', 'Math.abs', 'Math.acos', 'Math.asin', 'Math.atan', 'Math.atan2', 'Math.ceil', 'Math.cos', 'Math.exp', 'Math.floor', 'Math.log', 'Math.max', 'Math.min', 'Math.pow', 'Math.random', 'Math.round', 'Math.sin', 'Math.sqrt', 'Math.tan', 'parseInt', 'parseFloat', 'isNaN', 'NaN', 'RegExp', 'RegExp.prototype', 'RegExp.prototype.compile', 'RegExp.prototype.test', 'RegExp.prototype.exec', 'String', 'String.fromCharCode', 'String.prototype', 'String.prototype.charAt', 'String.prototype.charCodeAt', 'String.prototype.indexOf', 'String.prototype.match', 'String.prototype.replace', 'String.prototype.slice', 'String.prototype.split', 'String.prototype.substr', 'String.prototype.substring', 'String.prototype.toLowerCase', 'String.prototype.toUpperCase', 'Array', 'Array.prototype', 'Array.prototype.concat', 'Array.prototype.indexOf', 'Array.prototype.join', 'Array.prototype.pop', 'Array.prototype.push', 'Array.prototype.reverse', 'Array.prototype.shift', 'Array.prototype.slice', 'Array.prototype.sort', 'Array.prototype.splice', 'Array.prototype.unshift', 'Number', 'Number.prototype', 'Number.prototype.toFixed', 'Number.MAX_VALUE', 'Number.MIN_VALUE', 'Number.NEGATIVE_INFINITY', 'Number.NaN', 'Number.POSITIVE_INFINITY', 'Number.prototype', 'Boolean', 'Boolean.prototype', 'Error', 'Error.prototype', 'EvalError', 'EvalError.prototype', 'Infinity', 'JSON', 'JSON.stringify', 'JSON.parse', 'Object', 'Object.prototype', 'Object.prototype.toString', 'RangeError', 'RangeError.prototype', 'ReferenceError', 'ReferenceError.prototype', 'SyntaxError', 'SyntaxError.prototype', 'TypeError', 'TypeError.prototype', 'URIError', 'URIError.prototype', 'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'isFinite', 'undefined'];

    var globalsObj = {};
    globalNames.forEach(function (global) {
        globalsObj[global] = true;
    });
    return function pullGlobalsIntoVariables(assetGraph) {
        assetGraph.findAssets(_.extend({type: 'JavaScript'}, queryObj)).forEach(function (javaScriptAsset) {
            var occurrencesByGlobalName = {},
                ast = javaScriptAsset.parseTree,
                walker = uglifyJs.uglify.ast_walker(),
                seenNames = {}, // To avoid collisions when introducing new vars
                seenLocals = {}; // To avoid aliasing globals that are shadowed by a local var somewhere
            walker.with_walkers({
                dot: function () {
                    var stack = walker.stack(),
                        node = stack[stack.length - 1],
                        name = uglifyJs.uglify.gen_code(node);

                    if (name in globalsObj) {
                        if (!occurrencesByGlobalName.hasOwnProperty(name)) {
                            occurrencesByGlobalName[name] = [];
                        }
                        occurrencesByGlobalName[name].push(node);
                    }
                },
                defun: function (name) {
                    seenLocals[name] = true;
                },
                function: function (name) {
                    if (name) {
                        seenLocals[name] = name;
                    }
                },
                var: function (vars) {
                    vars.forEach(function (v) {
                        seenNames[v[0]] = true;
                        seenLocals[v[0]] = true;
                    });
                },
                name: function (name) {
                    seenNames[name] = true;
                    if (name in globalsObj) {
                        var stack = walker.stack(),
                            node = stack[stack.length - 1];
                        if (!occurrencesByGlobalName.hasOwnProperty(name)) {
                            occurrencesByGlobalName[name] = [];
                        }
                        occurrencesByGlobalName[name].push(node);
                    }
                }
            }, function() {
                walker.walk(ast);
            });
            // Order by number of dots ascending so e.g. Math is considered before Math.min:
            var globalNames = Object.keys(occurrencesByGlobalName).sort(function (a, b) {
                return a.split('.').length - b.split('.').length;
            });
            var aliasDeclarations = [],
                aliasByGlobalName = {};

            function nameToAst(name) {
                name = (!wrapInFunction && aliasByGlobalName.hasOwnProperty(name) && aliasByGlobalName[name]) || name;
                var nameFragments = name.split('.');
                if (nameFragments.length > 1) {
                    return ['dot', nameToAst(nameFragments.slice(0, nameFragments.length - 1).join('.')), nameFragments[nameFragments.length - 1]];
                } else {
                    return ['name', nameFragments[0]];
                }
            }

            globalNames.forEach(function (globalName) {
                if (!seenLocals.hasOwnProperty(globalName) && occurrencesByGlobalName[globalName].length > 1) {
                    var alias = globalName.replace(/\./g, '').toUpperCase();
                    while (seenNames.hasOwnProperty(alias)) {
                        alias += '_';
                    }
                    seenNames[alias] = true;
                    aliasDeclarations.push({name: alias, valueAst: nameToAst(globalName)});
                    occurrencesByGlobalName[globalName].forEach(function (occurrence) {
                        occurrence.splice(0, occurrence.length, 'name', alias);
                    });
                    aliasByGlobalName[globalName] = alias;
                } else {
                    delete occurrencesByGlobalName[globalName];
                }
            });
            if (aliasDeclarations.length) {
                if (wrapInFunction) {
                    ast[1] = [
                        [
                            'stat',
                            [
                                'call',
                                [
                                    'function',
                                    null,
                                    _.pluck(aliasDeclarations, 'name'),
                                    ast[1]
                                ],
                                _.pluck(aliasDeclarations, 'valueAst')
                            ]
                        ]
                    ];
                } else {
                    Array.prototype.unshift.apply(ast[1], aliasDeclarations.map(function (aliasDeclaration) {
                        return ['var', [[aliasDeclaration.name, aliasDeclaration.valueAst]]];
                    }));
                }
                javaScriptAsset.markDirty();
            }
        });
    };
};