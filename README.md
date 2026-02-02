<div align="center">

# physics

A small, dependency-free **2D physics engine** (AABB + circles) with a lightweight ECS toolkit (EntityManager + Scenes).

[Live demo / tests](https://chris.frazier.software/physics/)&nbsp;&nbsp;•&nbsp;&nbsp;[Source](https://github.com/chrisfrazier0/physics)

<!-- Badges -->

![License](https://img.shields.io/github/license/chrisfrazier0/physics)
![Last commit](https://img.shields.io/github/last-commit/chrisfrazier0/physics)
![Deploy](https://img.shields.io/badge/tests-live-brightgreen)

</div>

---

## What this is

This repo is primarily a **physics engine**, but it also includes a tiny set of **runtime primitives** used to build and run interactive tests quickly:

- **EntityManager** (ECS-style entity + component storage)
- **Scheduler** (fixed timestep + frame + render callbacks)
- **Scene** + **SceneManager** (system lists + scene stack w/ blocking/opaque semantics)
- **KeyboardSystem** (efficient dirty-key state tracking)

## Physics features

- **Semi-implicit Euler** integration
- **Sequential impulse** contact solver
- **Split impulse** style positional correction (velocity-level bias / Baumgarte)
- **Stable restitution** (threshold bounciness and gravity correction)
- **Spring forces** (with damping)
- **Positional constraints** (rope/rod/buffer style)
- **Friction**
  - Coulomb friction (tangent impulse clamped by normal impulse)
  - “Arcade” friction via `groundDrag`
  - Linear + quadratic drag
- **Shapes:** AABB + circle (no rotation)
- **Sleep** support
- Highly configurable (`configure(...)` patterns throughout)

## Tests

Tests are implemented as small standalone HTML files (one test per file) and are deployed here:

- https://chris.frazier.software/physics/

## Philosophy

- Small, readable, and hackable
- Minimal abstractions (most things are plain objects)
- ECS where it helps, not everywhere
