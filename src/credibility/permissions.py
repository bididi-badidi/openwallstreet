"""Codex custom permission profile, shared by verification and live execution."""
import json
from pathlib import Path
import subprocess
import sys
import shlex
import tempfile
from .engine import AgentDirectories

PROFILE = 'management-research'

def profile_arguments(directories: AgentDirectories):
    directories.prepare()
    rules = {':root':'deny', ':minimal':'read', str(directories.inputs.resolve()):'read',
             str(directories.work.resolve()):'write', str(directories.outputs.resolve()):'write'}
    table = '{' + ', '.join(json.dumps(k) + '=' + json.dumps(v) for k,v in rules.items()) + '}'
    return ['-c', f'default_permissions="{PROFILE}"', '-c', f'permissions.{PROFILE}.filesystem={table}',
            '-c', f'permissions.{PROFILE}.network.enabled=false']

PROBE_SCRIPT = '''
import json, pathlib, sys
paths=json.loads(sys.argv[1]); result={}
for key, path in paths.items():
    try:
        if key.endswith('_read'): pathlib.Path(path).read_text()
        else: pathlib.Path(path).write_text('synthetic verification')
        result[key]='allowed'
    except OSError: result[key]='denied'
print(json.dumps(result))
'''

def verify(directories: AgentDirectories, executable='codex'):
    directories.prepare()
    with tempfile.TemporaryDirectory(prefix='.isolation-sibling-', dir=directories.work.resolve().parent.parent) as sibling:
        inp=directories.inputs.resolve()/'isolation-input.txt'; inp.write_text('synthetic input')
        denied=Path(sibling)/'sentinel.txt'; denied.write_text('synthetic sibling')
        # Symlinks must not allow access outside the granted directory either.
        link=directories.work.resolve()/'isolation-link'; link.symlink_to(denied)
        paths={'input_read':str(inp),'work_write':str(directories.work.resolve()/'isolation-write'),
               'output_write':str(directories.outputs.resolve()/'isolation-write'),
               'input_write':str(inp),'sibling_read':str(denied),'sibling_write':str(denied),
               'symlink_read':str(link)}
        expected={key:('allowed' if key in ('input_read','work_write','output_write') else 'denied') for key in paths}
        try:
            script = '\n'.join(f"if ({('/bin/cat ' + shlex.quote(path) + ' > /dev/null') if key.endswith('_read') else ('printf test > ' + shlex.quote(path))}) 2>/dev/null; then printf '{key}=allowed\\n'; else printf '{key}=denied\\n'; fi" for key,path in paths.items())
            command=[executable,*profile_arguments(directories),'sandbox','-P',PROFILE,'--','/bin/sh','-c',script]
            proc=subprocess.run(command,cwd=directories.work.resolve(),capture_output=True,text=True,timeout=30)
            if proc.returncode:
                return {'verified':False,'status':'sandbox_launch_failed','exit_code':proc.returncode,'checks':'not_executed',
                        'reason':'sandbox_apply not permitted' if 'sandbox_apply' in proc.stderr else 'sandbox configuration or process failed', 'diagnostic':proc.stderr[-1000:]}
            try: checks=dict(line.split('=',1) for line in proc.stdout.strip().splitlines())
            except ValueError: return {'verified':False,'status':'invalid_probe_output'}
            return {'verified':checks==expected,'status':'checks_executed','profile':PROFILE,'checks':checks,'expected':expected,
                    'network':'agent command networking disabled; hosted web search is separate',
                    'scope':'explicit input read and work/output write, plus Codex minimal runtime reads'}
        finally:
            link.unlink(missing_ok=True); inp.unlink(missing_ok=True)
            for folder in (directories.work,directories.outputs): (folder/'isolation-write').unlink(missing_ok=True)

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(); parser.add_argument('--output',type=Path,required=True); args=parser.parse_args()
    dirs=AgentDirectories(args.output/'inputs',args.output/'work',args.output/'outputs')
    result=verify(dirs)
    (args.output/'verification.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
    raise SystemExit(0 if result['verified'] else 2)
