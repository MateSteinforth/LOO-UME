package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"runtime"

	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/download"
	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/install"
	"github.com/MateSteinforth/led-rhombicosidodecahedron/toolchains/bootstrap/internal/manifest"
)

const version = "1.0.0"

var buildTarget string

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "orbital-bootstrap:", err)
		os.Exit(1)
	}
}

func run(arguments []string) error {
	target, err := currentTarget()
	if err != nil {
		return err
	}
	if buildTarget != "" && buildTarget != target {
		return fmt.Errorf("binary target %q does not match runtime target %q", buildTarget, target)
	}
	if len(arguments) == 0 {
		usage()
		return fmt.Errorf("a command is required")
	}
	switch arguments[0] {
	case "target":
		if len(arguments) != 1 {
			return fmt.Errorf("target accepts no arguments")
		}
		fmt.Println(target)
		return nil
	case "version":
		if len(arguments) != 1 {
			return fmt.Errorf("version accepts no arguments")
		}
		fmt.Printf("orbital-bootstrap %s (%s; %s)\n", version, target, runtime.Version())
		return nil
	case "validate":
		flags := flag.NewFlagSet("validate", flag.ContinueOnError)
		manifestPath := flags.String("manifest", "", "strict install manifest")
		if err := flags.Parse(arguments[1:]); err != nil || *manifestPath == "" || flags.NArg() != 0 {
			return fmt.Errorf("usage: orbital-bootstrap validate --manifest PATH")
		}
		_, err := manifest.Load(*manifestPath)
		return err
	case "self-test":
		flags := flag.NewFlagSet("self-test", flag.ContinueOnError)
		root := flags.String("root", "", "repository root used for contained temporary files")
		if err := flags.Parse(arguments[1:]); err != nil || *root == "" || flags.NArg() != 0 {
			return fmt.Errorf("usage: orbital-bootstrap self-test --root PATH")
		}
		return install.SelfTest(context.Background(), target, *root)
	case "install", "verify":
		flags := flag.NewFlagSet(arguments[0], flag.ContinueOnError)
		manifestPath := flags.String("manifest", "", "strict install manifest")
		root := flags.String("root", "", "repository root")
		if err := flags.Parse(arguments[1:]); err != nil || *manifestPath == "" || *root == "" || flags.NArg() != 0 {
			return fmt.Errorf("usage: orbital-bootstrap %s --manifest PATH --root PATH", arguments[0])
		}
		resolvedRoot, resolvedManifest, err := validateRepositoryPaths(*root, *manifestPath)
		if err != nil {
			return err
		}
		document, err := manifest.Load(resolvedManifest)
		if err != nil {
			return err
		}
		if arguments[0] == "verify" {
			return install.Verify(document, target, resolvedRoot)
		}
		return install.Run(context.Background(), download.Client(), document, target, resolvedRoot)
	default:
		usage()
		return fmt.Errorf("unknown command %q", arguments[0])
	}
}

func currentTarget() (string, error) {
	architecture := map[string]string{"amd64": "x64", "arm64": "arm64"}[runtime.GOARCH]
	if architecture == "" {
		return "", fmt.Errorf("unsupported architecture %q", runtime.GOARCH)
	}
	target := runtime.GOOS + "-" + architecture
	if target != "linux-x64" && target != "darwin-arm64" && target != "darwin-x64" {
		return "", fmt.Errorf("unsupported target %q", target)
	}
	return target, nil
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: orbital-bootstrap <version|target|self-test|validate|install|verify> [options]")
}
