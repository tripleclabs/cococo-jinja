import type { Expr } from './ast.ts';
import { ExpressionError } from './errors.ts';
import { tokenize } from './lexer.ts';
import { parse } from './parser.ts';
export interface ParseLimits { maxSourceBytes: number; maxDepth: number; maxNodes: number; maxTokens: number }
export const standardParseLimits: Readonly<ParseLimits> = Object.freeze({maxSourceBytes:2048,maxDepth:32,maxNodes:512,maxTokens:2048});
/** Bare expression -> typed AST. Resource checks precede recursive parsing. */
export function parseBounded(source: string, limits: ParseLimits = standardParseLimits): Expr {
    if ([limits.maxSourceBytes,limits.maxDepth,limits.maxNodes,limits.maxTokens].some(n=>!Number.isSafeInteger(n)||n<=0)) throw ExpressionError.parse('parse limits must be positive',0);
    if(utf8Length(source)>limits.maxSourceBytes)throw ExpressionError.parse('expression source size exceeded',0);
    const tokens=tokenize(source);
    if(tokens.length>limits.maxTokens)throw ExpressionError.parse('expression token count exceeded',0);
    const ast=parse(tokens,limits.maxDepth);
    const stack: [Expr,number][]=[[ast,1]]; let count=0;
    while(stack.length){
        const [node,depth]=stack.pop()!; count++;
        if(count>limits.maxNodes||depth>limits.maxDepth)throw ExpressionError.parse('expression AST budget exceeded',0);
        let children: Expr[]=[];
        switch(node.e){
            case 'reference': count+=node.segments.length; children=node.segments.flatMap(s=>s.s==='dynamic'?[s.expr]:[]);break;
            case 'unary':children=[node.operand];break;
            case 'binary':children=[node.lhs,node.rhs];break;
            case 'logical':children=node.operands;break;
            case 'arrayLiteral':children=node.elements;break;
            case 'conditional':children=[node.condition,node.then,node.otherwise];break;
            case 'filter':children=[node.input,...node.arguments];break;
            case 'objectLiteral':children=node.entries.map(e=>e.value);break;
        }
        if(count>limits.maxNodes)throw ExpressionError.parse('expression AST budget exceeded',0);
        stack.push(...children.map(child=>[child,depth+1] as [Expr,number]));
    }
    return ast;
}

function utf8Length(source:string):number { let bytes=0; for(const c of source){const n=c.codePointAt(0)!;bytes+=n<=0x7f?1:n<=0x7ff?2:n<=0xffff?3:4;}return bytes; }
