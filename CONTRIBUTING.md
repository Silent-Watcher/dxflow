# Contributing to dxflow

First off, thank you for your interest in contributing to **dxflow**! We appreciate every contribution, whether it's fixing bugs, improving documentation, adding new features, or sharing ideas.

Our goal is to build a high-quality developer experience (DX) tool with a strong focus on reliability, performance, maintainability, and excellent TypeScript support.

---

# Table of Contents

* Code of Conduct
* Getting Started
* Development Setup
* Project Structure
* Development Workflow
* Coding Standards
* Commit Messages
* Pull Request Guidelines
* Testing
* Documentation
* Reporting Bugs
* Requesting Features
* Questions

---

# Code of Conduct

Please be respectful and constructive in all interactions.

We strive to create an inclusive, welcoming environment for everyone.

---

# Getting Started

Before making changes:

1. Fork the repository.
2. Clone your fork.

```bash
git clone https://github.com/Silent-Watcher/dxflow.git
```

3. Install dependencies.

```bash
npm install
```

4. Create a new branch.

```bash
git checkout -b feat/my-feature
```

---

# Development Setup

Run the project in development mode:

```bash
npm run dev
```

Run the tests:

```bash
npm test
```

Format and Lint the project:

```bash
npm run check
```

Run the full validation suite before opening a PR:

---

# Project Structure

Please keep new code organized according to the existing project layout.

* Keep modules focused.
* Avoid circular dependencies.
* Prefer composition over inheritance.
* Keep public APIs minimal.
* Avoid unnecessary abstractions.

---

# Development Workflow

1. Create an issue if one does not already exist.
2. Discuss significant changes before implementation.
3. Keep pull requests focused on a single concern.
4. Write tests for new functionality.
5. Update documentation when behavior changes.
6. Ensure CI passes before requesting review.

---

# Coding Standards

## TypeScript

* Use strict typing.
* Avoid `any`.
* Prefer `unknown` when appropriate.
* Export explicit types.
* Keep APIs strongly typed.

## Code Style

* Write self-documenting code.
* Prefer descriptive variable names.
* Keep functions small.
* Remove dead code.
* Avoid premature optimization.
* Prefer immutable data when practical.

## Error Handling

* Throw meaningful errors.
* Never silently swallow exceptions.
* Include useful context in error messages.

## Performance

Developer tooling should be fast.

When contributing:

* Minimize allocations.
* Avoid unnecessary filesystem access.
* Cache expensive operations where appropriate.
* Benchmark performance-sensitive changes.

---

# Commit Messages

We follow Conventional Commits.

Examples:

```
feat(cli): add project initialization command

fix(parser): handle nested configuration files

refactor(core): simplify task scheduler

docs: improve installation guide

test(cli): add integration tests
```

---

# Pull Request Guidelines

Before submitting a pull request, ensure:

* The project builds successfully.
* All tests pass.
* Linting passes.
* Formatting is correct.
* Documentation is updated.
* No unrelated files are included.

Please include:

* A clear description of the change.
* Motivation for the change.
* Screenshots or terminal output if applicable.
* References to related issues.

Small, focused pull requests are preferred over large, multi-purpose ones.

---

# Testing

Every new feature should include appropriate tests.

Recommended testing strategy:

* Unit tests for isolated logic.
* Integration tests for module interactions.
* End-to-end tests when user workflows change.

Bug fixes should include a regression test whenever possible.

---

# Documentation

Documentation is part of the project.

Please update documentation when:

* APIs change
* CLI behavior changes
* Configuration changes
* New features are introduced
* Existing behavior changes

Good documentation is just as valuable as good code.

---

# Reporting Bugs

When opening a bug report, please include:

* Operating system
* Node.js version
* Package manager
* dxflow version
* Steps to reproduce
* Expected behavior
* Actual behavior
* Relevant logs or screenshots

A minimal reproduction repository is greatly appreciated.

---

# Requesting Features

Feature requests should explain:

* The problem being solved
* Proposed solution
* Possible alternatives
* Potential drawbacks

Please avoid proposing implementation details unless necessary.

---

# Questions

If you have questions about the project, feel free to open a discussion before starting major work.

We're happy to help contributors get started.

---

# License

By contributing to dxflow, you agree that your contributions will be licensed under the project's license.
