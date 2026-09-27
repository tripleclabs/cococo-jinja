import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {parseBounded,standardParseLimits,evaluateExpr,fromJSON,toJSONLogicValue,FilterRegistry,makeLimits,ExpressionError} from '../src/index.ts';
const cases=JSON.parse(readFileSync(new URL('../../fixtures/bounded-parser/cases.json',import.meta.url),'utf8'));
for(const c of cases)test('bounded parser parity: '+c.id,()=>{
    const run=()=>evaluateExpr(parseBounded(c.source,{...standardParseLimits,...(c.maxTokens?{maxTokens:c.maxTokens}:{}),...(c.maxNodes?{maxNodes:c.maxNodes}:{})}),fromJSON(c.context??{}),FilterRegistry.standard,makeLimits({maxOperations:c.maxOperations??1000,countValueTraversal:c.countValueTraversal??false}));
    if(c.error){try{run();throw Error('Expected failure');}catch(error){expect(error).toBeInstanceOf(ExpressionError);expect((error as ExpressionError).phase).toBe(c.error);}}
    else expect(toJSONLogicValue(run())).toEqual(c.result);
});
