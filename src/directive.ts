import {
  ExceptionHandlerService,
  SimplifiedAttributes,
  SimplifiedCompiledExpression,
  SimplifiedJQLite,
  SimplifiedParseService,
  SimplifiedRootScopeService,
  SimplifiedScope
} from './types';
import { getNormalizedPropOrEventName } from './utils';

export const directiveSelector = 'ngCustomElement';

export const directiveFactory = [
  '$exceptionHandler',
  '$parse',
  '$rootScope',
  function directiveFactory(
    $exceptionHandler: ExceptionHandlerService,
    $parse: SimplifiedParseService,
    $rootScope: SimplifiedRootScopeService
  ) {
    const EVENT_HANDLER_ATTR_REGEXP = /^(on[a-z]+|formaction)$/;

    function safelyCall(fn: Function) {
      try {
        fn();
      } catch (error) {
        $exceptionHandler(error);
      }
    }

    return {
      restrict: 'A',
      priority: 100,
      compile: (_: unknown, cAttrs: SimplifiedAttributes) => {
        // Extract props.
        const propExprPairs = Object.keys(cAttrs)
          .filter(attr => attr.startsWith('ngceProp'))
          .map(
            (attr): [string, SimplifiedCompiledExpression] => [
              getNormalizedPropOrEventName(cAttrs.$attr[attr]),
              $parse(cAttrs[attr])
            ]
          );

        // Extract events.
        const eventExprPairs = Object.keys(cAttrs)
          .filter(attr => attr.startsWith('ngceOn'))
          .map(
            (attr): [string, SimplifiedCompiledExpression] => [
              getNormalizedPropOrEventName(cAttrs.$attr[attr]),
              $parse(cAttrs[attr])
            ]
          );

        return {
          pre: (scope: SimplifiedScope, elem: SimplifiedJQLite) => {
            // Set up property bindings.
            const unwatchFns = propExprPairs.map(([propName, parsedExpr]) => {
              if (EVENT_HANDLER_ATTR_REGEXP.test(propName)) {
                throw new Error(
                  'Property bindings for HTML DOM event properties are disallowed.'
                );
              }

              const setProp = (newValue: any) => elem.prop(propName, newValue);

              setProp(parsedExpr(scope));
              return scope.$watch(parsedExpr, setProp);
            });

            elem.on('$destroy', () => unwatchFns.forEach(safelyCall));
          },
          post: (scope: SimplifiedScope, elem: SimplifiedJQLite) => {
            // Set up event bindings.
            eventExprPairs.forEach(([eventName, parsedExpr]) => {
              elem.on(eventName, evt => {
                evt = evt.originalEvent || evt;
                const callback = parsedExpr.bind(null, scope, { $event: evt });

                if (!$rootScope.$$phase) {
                  scope.$apply(callback);
                } else {
                  safelyCall(callback);
                }
              });
            });
          }
        };
      }
    };
  }
];
