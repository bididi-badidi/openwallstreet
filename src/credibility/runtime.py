"""Codex CLI engine with per-job custom filesystem profiles and live verification."""
from __future__ import annotations
import json
import os
from pathlib import Path
import subprocess
import tempfile
import uuid
from .engine import EngineRequest, EngineResult, EngineConfig, AgentDirectories
from .permissions import profile_arguments, verify

DEFAULT_MODEL = 'gpt-5.6-luna'
DEFAULT_REASONING_EFFORT = 'xhigh'

class CodexRuntimeError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message); self.code=code; self.message=message

class CodexRuntime:
    mode='live'
    provider='codex-cli'
    def __init__(self, executable='codex', model=DEFAULT_MODEL, reasoning_effort=DEFAULT_REASONING_EFFORT,
                 timeout_s=600, probe_timeout_s=30, enable_search=True):
        if model != DEFAULT_MODEL or reasoning_effort != DEFAULT_REASONING_EFFORT:
            raise ValueError('This collection engine requires gpt-5.6-luna with xhigh; no substitution is supported')
        if not 1 <= timeout_s <= 1800: raise ValueError('timeout_s must be between 1 and 1800')
        self.executable=executable; self.model=model; self.reasoning_effort=reasoning_effort
        self.timeout_s=timeout_s; self.probe_timeout_s=probe_timeout_s; self.enable_search=enable_search
    @property
    def config(self): return EngineConfig(self.model,self.reasoning_effort,self.timeout_s)

    def execute(self, request: EngineRequest) -> EngineResult:
        request.directories.prepare()
        check=verify(request.directories,self.executable)
        (request.directories.outputs/'sandbox-verification.json').write_text(json.dumps(check,indent=2)+'\n')
        if not check['verified']:
            raise CodexRuntimeError('sandbox_verification_failed','Custom directory sandbox verification failed; see sandbox-verification.json')
        call=uuid.uuid4().hex[:12]
        schema_path=request.directories.inputs.resolve()/f'{call}.schema.json'
        response_path=request.directories.outputs.resolve()/f'{call}.response.json'
        schema_path.write_text(json.dumps(request.response_schema)+'\n')
        prompt_path=request.directories.inputs.resolve()/f'{call}.prompt.txt'
        prompt_path.write_text(request.prompt)
        command=self._command(request.directories,schema_path,response_path)
        try:
            proc=subprocess.run(command,input=request.prompt,text=True,cwd=request.directories.work.resolve(),
                                capture_output=True,timeout=self.timeout_s,env=dict(os.environ),check=False)
        except subprocess.TimeoutExpired:
            raise CodexRuntimeError('timeout',f'Codex call exceeded {self.timeout_s} seconds') from None
        except OSError:
            raise CodexRuntimeError('cli_unavailable','Codex executable could not be started') from None
        events=[]
        for line in proc.stdout.splitlines():
            try: event=json.loads(line)
            except json.JSONDecodeError: continue
            item=event.get('item', {})
            events.append({'event':event.get('type'), 'item_type':item.get('type'), 'tool':item.get('name', item.get('tool')), 'query':item.get('query')})
        (request.directories.outputs/f'{call}.events.json').write_text(json.dumps(events,indent=2)+'\n')
        if proc.returncode:
            raise CodexRuntimeError('process_failed',self._failure_message(proc.returncode,proc.stderr))
        try: data=json.loads(response_path.read_text())
        except (OSError,json.JSONDecodeError):
            raise CodexRuntimeError('invalid_response','Codex did not return structured JSON') from None
        if not isinstance(data,dict): raise CodexRuntimeError('invalid_response','Expected a JSON object')
        # Record only non-secret execution provenance, not full CLI logs/environment.
        (request.directories.outputs/f'{call}.execution.json').write_text(json.dumps({
            'provider':'codex-cli','model':self.model,'reasoning_effort':self.reasoning_effort,
            'permission_profile':'management-research','sandbox_verified':True,'response':response_path.name,
            'agent_command_network':False,'hosted_web_search':self.enable_search},indent=2)+'\n')
        return EngineResult(data,'codex-cli',self.model)

    def _command(self, directories, schema_path, response_path):
        # Profiles and legacy --sandbox must never be mixed.
        command=[self.executable,*profile_arguments(directories),'-c','approval_policy="never"',
                 '-c','shell_environment_policy.inherit="none"',
                 '-c','shell_environment_policy.set={PATH="/usr/bin:/bin:/usr/sbin:/sbin",HOME='+json.dumps(str(directories.work.resolve()))+',TMPDIR='+json.dumps(str(directories.work.resolve()))+'}']
        if self.enable_search: command.append('--search')
        command += ['exec','--ignore-user-config','--ignore-rules','--model',self.model,
                    '-c',f'model_reasoning_effort="{self.reasoning_effort}"','--ephemeral','--skip-git-repo-check',
                    '--json','--output-schema',str(schema_path),'--output-last-message',str(response_path),'--color','never','-']
        return command

    def probe(self, execute=True):
        result={'available':False,'collection_allowed':False,'model':self.model,'reasoning_effort':self.reasoning_effort}
        try:
            version=subprocess.run([self.executable,'--version'],capture_output=True,text=True,timeout=self.probe_timeout_s)
            result['version']=version.stdout.strip()[:100]
            with tempfile.TemporaryDirectory(prefix='management-probe-') as temp:
                root=Path(temp); dirs=AgentDirectories(root/'inputs',root/'work',root/'outputs')
                check=verify(dirs,self.executable); result['sandbox']=check
                if not check['verified']: return result
                if execute:
                    schema={'type':'object','properties':{'ok':{'type':'boolean'}},'required':['ok'],'additionalProperties':False}
                    answer=self.execute(EngineRequest('Return exactly {"ok":true}. Do not access files or tools.',schema,dirs))
                    result['available']=answer.data.get('ok') is True
                    result['execution']='success' if result['available'] else 'unexpected_response'
                else: result['execution']='not_attempted'
                result['collection_allowed']=result['available']
        except CodexRuntimeError as exc: result.update(execution=exc.code,message=exc.message)
        except (OSError,subprocess.TimeoutExpired): result.update(execution='runtime_unavailable')
        return result

    @staticmethod
    def _failure_message(returncode,stderr):
        text=stderr.lower()
        if 'model' in text and any(w in text for w in ('not found','unknown','unavailable','not supported')): reason='Requested model unavailable'
        elif any(w in text for w in ('unauthorized','authentication','login')): reason='Authentication unavailable'
        elif 'permission' in text or 'not permitted' in text: reason='Runtime permission failure'
        elif 'config' in text: reason='Runtime configuration failure'
        else: reason='Codex execution failed'
        return f'{reason} (exit {returncode})'
