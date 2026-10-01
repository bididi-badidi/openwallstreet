import argparse
import json
from pathlib import Path
from .pipeline import Coordinator
from .api_transport import ApiRuntimeError
from .engine_factory import add_engine_arguments, create_engine

def main():
    parser = argparse.ArgumentParser(description='Collect primary-report management evidence')
    parser.add_argument('--config', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--fixture', action='store_true', help='Run fictional deterministic verification without a model')
    parser.add_argument('--probe', action='store_true', help='Check the selected model engine and search access')
    parser.add_argument('--list-models', action='store_true', help='List exact model IDs available from Nebius')
    add_engine_arguments(parser)
    args = parser.parse_args()
    if args.fixture and (args.probe or args.list_models or args.engine):
        parser.error('--fixture cannot be combined with an engine, probe or model listing')
    if not (args.probe or args.list_models) and (not args.config or not args.output):
        parser.error('--config and --output are required')
    if args.fixture:
        from .fixtures import FixtureRuntime, fixture_fetch
        runtime = FixtureRuntime(); options = {'fetcher': fixture_fetch}
    else:
        try:
            runtime = create_engine(args.engine, args.env_file)
            if args.list_models:
                if not hasattr(runtime, 'list_models'): parser.error('--list-models requires --engine nebius')
                print(json.dumps({'provider': runtime.provider, 'models': runtime.list_models()}, indent=2)); return
            if args.probe:
                probe = runtime.probe()
                print(json.dumps(probe, indent=2))
                if not probe.get('collection_allowed'): raise SystemExit(2)
                return
            if hasattr(runtime, 'validate_configuration'): runtime.validate_configuration(search=True)
        except (ValueError, ApiRuntimeError) as exc:
            parser.error(str(exc))
        options = {}
    config = json.loads(args.config.read_text())
    result = Coordinator(config, runtime, args.output, **options).run()
    print(json.dumps({'status': result['status'], 'mode': result['mode'], 'documents': len(result['documents']), 'claims': len(result['claims']), 'output': str(args.output.resolve() / 'evidence.json')}, indent=2))
    if result['status'] != 'complete': raise SystemExit(2)

if __name__ == '__main__': main()
