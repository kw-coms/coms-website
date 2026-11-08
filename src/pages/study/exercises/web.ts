import { buildDoc, SANDBOX_URL } from '../studyDemos'
import type { WebExercise, WebFiles } from './types'

export interface WebCheckResult { name: string; passed: boolean; message: string }

// The iframe has an opaque origin. The parent validates source, origin and a fresh nonce.
// Student JavaScript can read the nonce in its own document and forge a local pass;
// this self-cheating limit is accepted because exercise progress is local only.
// JSON is escaped before it is embedded in an inline script, so a check cannot close the script tag.
export function buildExerciseDoc(files: WebFiles, checks: WebExercise['checks'], nonce: string): string {
  const payload = JSON.stringify({ names: checks.map((c) => c.name), nonce }).replace(/</g, '\\u003c')
  const functions = checks.map((check) => `async function(t){${check.code.replace(/<\/script/gi, '<\\/script')}\n}`).join(',')
  const grader = `<script>(function(){
    var data=${payload}, functions=[${functions}], logs=[], oldLog=console.log;
    console.log=function(){logs.push(Array.prototype.map.call(arguments,String).join(' ')); return oldLog.apply(console,arguments)};
    var started=false;
    async function run(){
      if(started)return; started=true;
      var results=[], end=Date.now()+8000;
      var t={
        $:function(sel){return document.querySelector(sel)},
        $$:function(sel){return Array.from(document.querySelectorAll(sel))},
        text:function(sel){var e=document.querySelector(sel);return e?e.textContent||'':''},
        style:function(sel,prop){var e=document.querySelector(sel);return e?getComputedStyle(e).getPropertyValue(prop):''},
        click:function(sel){var e=document.querySelector(sel);if(!e)throw Error('요소를 찾을 수 없어요: '+sel);e.click()},
        type:function(sel,value){var e=document.querySelector(sel);if(!e)throw Error('요소를 찾을 수 없어요: '+sel);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}))},
        wait:function(ms){return new Promise(function(resolve){setTimeout(resolve,Math.min(Math.max(Number(ms)||0,0),500))})},
        log:logs
      };
      for(var i=0;i<data.names.length;i++){
        var name=data.names[i], left=end-Date.now();
        if(left<=0){results.push({name:name,passed:false,message:'전체 채점 시간이 초과됐어요.'});continue}
        var timer;
        try{
          var value=await Promise.race([
            Promise.resolve().then(function(){return functions[i](t)}),
            new Promise(function(_,reject){timer=setTimeout(function(){reject(Error('검사 시간이 초과됐어요.'))},Math.min(2000,left))})
          ]);
          results.push({name:name,passed:value===true,message:value===true?'통과':typeof value==='string'?value:'조건을 충족하지 못했어요.'});
        }catch(error){results.push({name:name,passed:false,message:error&&error.message||'검사 중 오류가 났어요.'})}
        finally{clearTimeout(timer)}
      }
      parent.postMessage({__exercise:true,nonce:data.nonce,results:results},'*');
    }
    window.addEventListener('load',run,{once:true});
    if(document.readyState==='complete')setTimeout(run,0);
  })();</script>`
  return buildDoc({ html: files.html, css: files.css, js: files.js }, -1).replace('</head>', () => grader + '</head>')
}

export function loadWebPreview(frame: HTMLIFrameElement, files: WebFiles): void {
  frame.onload = () => {
    frame.onload = null
    frame.contentWindow?.postMessage({ doc: buildDoc({ html: files.html, css: files.css, js: files.js }, -1) }, '*')
  }
  frame.src = `${SANDBOX_URL}?practice=${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function gradeWebInFrame(frame: HTMLIFrameElement, files: WebFiles, checks: WebExercise['checks'], signal?: AbortSignal): Promise<WebCheckResult[]> {
  const nonce = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('aborted', 'AbortError')); return }
    let done = false
    const finish = (result?: WebCheckResult[], error?: Error) => {
      if (done) return
      done = true
      window.clearTimeout(deadline)
      window.removeEventListener('message', receive)
      signal?.removeEventListener('abort', abort)
      frame.onload = null
      if (error) frame.src = 'about:blank'
      if (error) reject(error)
      else resolve(result ?? [])
    }
    const abort = () => finish(undefined, new DOMException('aborted', 'AbortError'))
    const receive = (event: MessageEvent) => {
      const data = event.data
      if (event.source !== frame.contentWindow || event.origin !== 'null' || !data || data.__exercise !== true || data.nonce !== nonce || !Array.isArray(data.results)) return
      if (data.results.length !== checks.length || !data.results.every((item: WebCheckResult, index: number) => item && item.name === checks[index].name && typeof item.passed === 'boolean' && typeof item.message === 'string')) return
      finish(data.results)
    }
    const deadline = window.setTimeout(() => finish(undefined, new Error('채점 시간이 초과됐어요.')), 8500)
    window.addEventListener('message', receive)
    signal?.addEventListener('abort', abort, { once: true })
    frame.onload = () => {
      frame.onload = null
      frame.contentWindow?.postMessage({ doc: buildExerciseDoc(files, checks, nonce) }, '*')
    }
    frame.src = `${SANDBOX_URL}?practice=${encodeURIComponent(nonce)}`
  })
}
