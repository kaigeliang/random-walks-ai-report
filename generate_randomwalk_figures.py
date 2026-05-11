#!/usr/bin/env python3
"""Regenerate the random-walk figures used by conference_101719.tex.

The script deliberately uses real stochastic simulations with fixed seeds:

* independent one-dimensional coin-flip walks;
* empirical CLT histograms from replicated walks;
* a random-surfer PageRank Markov chain;
* an iterative Gaussian noising walk for diffusion;
* a graph random walk for the DeepWalk illustration;
* random-walk Metropolis samples for a banana-shaped target.

Run from this directory with:

    python3 generate_randomwalk_figures.py
"""

from __future__ import annotations

import math
import os
import tempfile
from collections import Counter
from pathlib import Path

_cache_root = Path(tempfile.gettempdir()) / "randomwalk_report_cache"
os.environ.setdefault("MPLCONFIGDIR", str(_cache_root / "matplotlib"))
os.environ.setdefault("XDG_CACHE_HOME", str(_cache_root / "xdg"))
os.environ.setdefault("MPLBACKEND", "Agg")

import matplotlib as mpl

mpl.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.collections import LineCollection
from matplotlib.lines import Line2D
from matplotlib.patches import FancyArrowPatch


OUT_DIR = Path(__file__).resolve().parent
SEED = 2711

COLORS = {
    "blue": "#0072B2",
    "sky": "#56B4E9",
    "green": "#009E73",
    "gold": "#E69F00",
    "vermillion": "#D55E00",
    "pink": "#CC79A7",
    "ink": "#1F2933",
    "muted": "#6B7280",
    "grid": "#D9DEE7",
    "paper": "#FFFFFF",
}


def set_style() -> None:
    mpl.rcParams.update(
        {
            "figure.dpi": 150,
            "savefig.dpi": 300,
            "savefig.bbox": "tight",
            "savefig.pad_inches": 0.035,
            "font.family": "DejaVu Sans",
            "font.size": 8.5,
            "axes.titlesize": 9.5,
            "axes.labelsize": 8.5,
            "axes.linewidth": 0.8,
            "xtick.labelsize": 7.5,
            "ytick.labelsize": 7.5,
            "legend.fontsize": 7.5,
            "pdf.fonttype": 42,
            "ps.fonttype": 42,
        }
    )


def clean_axis(ax: plt.Axes, *, grid: bool = True) -> None:
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#4B5563")
    ax.spines["bottom"].set_color("#4B5563")
    ax.tick_params(colors="#374151", width=0.7, length=3)
    if grid:
        ax.grid(True, color=COLORS["grid"], linewidth=0.55, alpha=0.75)
        ax.set_axisbelow(True)


def save(fig: plt.Figure, name: str) -> None:
    fig.savefig(OUT_DIR / name)
    plt.close(fig)
    print(f"wrote {name}")


def random_walk_paths(rng: np.random.Generator, n_walks: int, n_steps: int) -> np.ndarray:
    """Return n_walks independent fair random walks S_0,...,S_n."""
    steps = rng.choice(np.array([-1, 1], dtype=int), size=(n_walks, n_steps))
    paths = np.concatenate(
        [np.zeros((n_walks, 1), dtype=int), np.cumsum(steps, axis=1)], axis=1
    )
    return paths


def fig_walks(rng: np.random.Generator) -> None:
    n_steps = 400
    paths = random_walk_paths(rng, n_walks=8, n_steps=n_steps)
    t = np.arange(n_steps + 1)
    envelope = np.sqrt(t)

    fig, ax = plt.subplots(figsize=(3.45, 2.45))
    for i, path in enumerate(paths):
        ax.plot(t, path, color=COLORS["blue"], alpha=0.36, linewidth=1.0)
        ax.scatter(t[-1], path[-1], s=8, color=COLORS["blue"], alpha=0.55, zorder=3)

    ax.plot(t, envelope, color=COLORS["gold"], linewidth=1.7, label=r"$+\sqrt{n}$")
    ax.plot(t, -envelope, color=COLORS["gold"], linewidth=1.7, label=r"$-\sqrt{n}$")
    ax.axhline(0, color=COLORS["ink"], linewidth=0.75, alpha=0.6)
    ax.set_xlim(0, n_steps)
    ax.set_ylim(-44, 44)
    ax.set_xlabel("step n")
    ax.set_ylabel(r"position $S_n$")
    ax.set_title("Independent fair random walks")
    clean_axis(ax)
    ax.legend(frameon=False, loc="upper left", ncol=2, handlelength=1.6)
    save(fig, "fig_walks.pdf")


def normal_pdf(x: np.ndarray) -> np.ndarray:
    return np.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


def fig_clt(rng: np.random.Generator) -> None:
    ns = [20, 200, 2000]
    n_reps = 12_000
    xs = np.linspace(-4, 4, 500)

    fig, axes = plt.subplots(1, 3, figsize=(6.95, 2.35), sharey=True)
    for ax, n in zip(axes, ns):
        endpoints = 2 * rng.binomial(n=n, p=0.5, size=n_reps) - n
        samples = endpoints / math.sqrt(n)
        ax.hist(
            samples,
            bins=np.linspace(-4, 4, 41),
            density=True,
            color=COLORS["sky"],
            alpha=0.74,
            edgecolor="white",
            linewidth=0.45,
        )
        ax.plot(xs, normal_pdf(xs), color=COLORS["gold"], linewidth=2.0)
        ax.set_title(f"n = {n}")
        ax.set_xlim(-4, 4)
        ax.set_ylim(0, 0.48)
        ax.set_xlabel(r"$S_n/\sqrt{n}$")
        clean_axis(ax)
    axes[0].set_ylabel("density")
    handles = [
        Line2D([0], [0], color=COLORS["sky"], lw=6, alpha=0.74, label="empirical"),
        Line2D([0], [0], color=COLORS["gold"], lw=2, label=r"$N(0,1)$"),
    ]
    fig.legend(handles=handles, loc="upper center", ncol=2, frameon=False, bbox_to_anchor=(0.5, 1.05))
    fig.subplots_adjust(wspace=0.16, top=0.82)
    save(fig, "fig_clt.pdf")


def pagerank_power_iteration(
    graph: dict[str, list[str]], alpha: float = 0.15, tol: float = 1e-13
) -> dict[str, float]:
    nodes = list(graph)
    idx = {node: i for i, node in enumerate(nodes)}
    n = len(nodes)
    transition = np.zeros((n, n), dtype=float)
    for src, targets in graph.items():
        if targets:
            prob = 1.0 / len(targets)
            for dst in targets:
                transition[idx[dst], idx[src]] += prob
        else:
            transition[:, idx[src]] = 1.0 / n

    rank = np.full(n, 1.0 / n)
    teleport = np.full(n, 1.0 / n)
    for _ in range(10_000):
        nxt = (1.0 - alpha) * transition @ rank + alpha * teleport
        if np.linalg.norm(nxt - rank, ord=1) < tol:
            rank = nxt
            break
        rank = nxt
    return {node: float(rank[idx[node]]) for node in nodes}


def simulate_random_surfer(
    rng: np.random.Generator, graph: dict[str, list[str]], steps: int, alpha: float = 0.15
) -> dict[str, float]:
    nodes = list(graph)
    current = nodes[0]
    visits = Counter()
    for _ in range(steps):
        visits[current] += 1
        if rng.random() < alpha or not graph[current]:
            current = rng.choice(nodes).item()
        else:
            current = rng.choice(graph[current]).item()
    return {node: visits[node] / steps for node in nodes}


def draw_directed_edge(
    ax: plt.Axes,
    xy0: tuple[float, float],
    xy1: tuple[float, float],
    *,
    color: str,
    alpha: float = 0.72,
    lw: float = 1.0,
    rad: float = 0.0,
) -> None:
    patch = FancyArrowPatch(
        xy0,
        xy1,
        arrowstyle="-|>",
        mutation_scale=8.0,
        linewidth=lw,
        color=color,
        alpha=alpha,
        shrinkA=17,
        shrinkB=17,
        connectionstyle=f"arc3,rad={rad}",
        zorder=1,
    )
    ax.add_patch(patch)


def fig_pagerank(rng: np.random.Generator) -> None:
    graph = {
        "A": ["B"],
        "B": ["B", "C"],
        "C": ["A"],
        "D": ["A"],
        "E": ["A"],
    }
    rank = pagerank_power_iteration(graph)
    pos = {
        "A": (0.0, 0.18),
        "B": (1.35, 0.18),
        "C": (2.28, 0.98),
        "D": (-0.88, 1.04),
        "E": (-0.88, -0.68),
    }
    incoming = {node: 0 for node in graph}
    for targets in graph.values():
        for dst in targets:
            incoming[dst] += 1

    fig, ax = plt.subplots(figsize=(3.0, 2.48))
    for src, targets in graph.items():
        for dst in targets:
            if src == dst:
                x, y = pos[src]
                loop = FancyArrowPatch(
                    (x + 0.48, y + 0.52),
                    (x - 0.48, y + 0.52),
                    arrowstyle="-|>",
                    mutation_scale=8.0,
                    linewidth=1.0,
                    color=COLORS["muted"],
                    alpha=0.72,
                    shrinkA=0,
                    shrinkB=0,
                    connectionstyle="arc3,rad=1.05",
                    zorder=2,
                )
                ax.add_patch(loop)
            else:
                rad = 0.10 if {src, dst} == {"A", "B"} else 0.04
                draw_directed_edge(ax, pos[src], pos[dst], color=COLORS["muted"], rad=rad)

    max_rank = max(rank.values())
    for node, (x, y) in pos.items():
        is_top = rank[node] == max_rank
        size = 760 + 2600 * rank[node]
        face = COLORS["gold"] if is_top else COLORS["sky"]
        edge = COLORS["ink"] if is_top else "white"
        ax.scatter([x], [y], s=size, color=face, edgecolor=edge, linewidth=1.05, zorder=3)
        ax.text(x, y + 0.04, node, ha="center", va="center", weight="bold", color="#111827", fontsize=8.6, zorder=4)
        ax.text(
            x,
            y - 0.20,
            f"{rank[node]:.2f}",
            ha="center",
            va="center",
            fontsize=6.9,
            color="#111827",
            zorder=4,
        )
        ax.text(
            x,
            y - 0.36,
            f"in={incoming[node]}",
            ha="center",
            va="center",
            fontsize=6.0,
            color=COLORS["muted"],
            zorder=4,
        )

    ax.set_xlim(-1.38, 2.72)
    ax.set_ylim(-1.05, 1.45)
    ax.set_aspect("equal")
    ax.axis("off")
    save(fig, "fig_pagerank.pdf")


def fig_diffusion(rng: np.random.Generator) -> None:
    n_samples = 20_000
    n_steps = 260
    beta = np.linspace(0.001, 0.045, n_steps)
    modes = rng.choice(np.array([-1.0, 1.0]), size=n_samples)
    x = 1.9 * modes + 0.38 * rng.normal(size=n_samples)
    snapshots = {0: x.copy()}
    keep = {65, 150, 260}

    for t, b in enumerate(beta, start=1):
        x = math.sqrt(1.0 - b) * x + math.sqrt(b) * rng.normal(size=n_samples)
        if t in keep:
            snapshots[t] = x.copy()

    fig, axes = plt.subplots(1, 4, figsize=(6.95, 2.28), sharey=True)
    xs = np.linspace(-4.2, 4.2, 500)
    labels = [(0, r"$t=0$"), (65, r"$t=65$"), (150, r"$t=150$"), (260, r"$t=T$")]
    for ax, (step, title) in zip(axes, labels):
        ax.hist(
            snapshots[step],
            bins=np.linspace(-4.2, 4.2, 58),
            density=True,
            color=COLORS["blue"] if step < n_steps else COLORS["sky"],
            alpha=0.72,
            edgecolor="white",
            linewidth=0.22,
        )
        if step == n_steps:
            ax.plot(xs, normal_pdf(xs), color=COLORS["gold"], linewidth=2.0, label=r"$N(0,1)$")
            ax.legend(frameon=False, loc="upper left", handlelength=1.5)
        ax.set_title(title)
        ax.set_xlim(-4.2, 4.2)
        ax.set_ylim(0, 0.62)
        ax.set_xlabel("x")
        clean_axis(ax)
    axes[0].set_ylabel("density")
    fig.subplots_adjust(wspace=0.12)
    save(fig, "fig_diffusion.pdf")


def graph_random_walk(
    rng: np.random.Generator, graph: dict[str, list[str]], start: str, length: int
) -> list[str]:
    path = [start]
    current = start
    for _ in range(length):
        current = rng.choice(graph[current]).item()
        path.append(current)
    return path


def fig_deepwalk(rng: np.random.Generator) -> None:
    graph = {
        "v1": ["v2", "v3"],
        "v2": ["v1", "v3", "v4"],
        "v3": ["v1", "v2", "v5"],
        "v4": ["v2", "v5", "v6"],
        "v5": ["v3", "v4", "v6"],
        "v6": ["v4", "v5"],
    }
    pos = {
        "v1": (-1.2, 0.75),
        "v2": (-0.35, 1.05),
        "v3": (-0.62, 0.0),
        "v4": (0.55, 0.78),
        "v5": (0.72, -0.15),
        "v6": (1.55, 0.28),
    }
    path = graph_random_walk(rng, graph, start="v1", length=7)
    path_edges = list(zip(path[:-1], path[1:]))

    fig, ax = plt.subplots(figsize=(3.45, 2.35))
    drawn = set()
    for src, targets in graph.items():
        for dst in targets:
            key = tuple(sorted((src, dst)))
            if key in drawn:
                continue
            drawn.add(key)
            x0, y0 = pos[src]
            x1, y1 = pos[dst]
            ax.plot([x0, x1], [y0, y1], color="#C6CED8", linewidth=1.3, zorder=1)

    for src, dst in path_edges:
        x0, y0 = pos[src]
        x1, y1 = pos[dst]
        ax.plot([x0, x1], [y0, y1], color=COLORS["gold"], linewidth=3.1, alpha=0.9, zorder=2)
        ax.annotate(
            "",
            xy=(x1, y1),
            xytext=(x0, y0),
            arrowprops=dict(arrowstyle="-|>", color=COLORS["gold"], lw=1.6, shrinkA=15, shrinkB=15),
            zorder=3,
        )

    visit_counts = Counter(path)
    for node, (x, y) in pos.items():
        face = COLORS["gold"] if node in visit_counts else COLORS["sky"]
        edge = COLORS["ink"] if node in visit_counts else "white"
        ax.scatter([x], [y], s=490, color=face, edgecolor=edge, linewidth=1.05, zorder=4)
        ax.text(x, y, node, ha="center", va="center", weight="bold", fontsize=8.5, color="#111827", zorder=5)

    sentence = " -> ".join(path)
    ax.text(
        0.12,
        -0.72,
        "walk sentence",
        ha="center",
        va="center",
        fontsize=7.0,
        color=COLORS["muted"],
    )
    ax.text(
        0.12,
        -0.94,
        sentence,
        ha="center",
        va="center",
        fontsize=7.3,
        color=COLORS["ink"],
        bbox=dict(boxstyle="round,pad=0.28", facecolor="#F8FAFC", edgecolor="#D1D5DB", linewidth=0.7),
    )
    ax.set_xlim(-1.62, 1.95)
    ax.set_ylim(-1.12, 1.28)
    ax.set_aspect("equal")
    ax.axis("off")
    save(fig, "fig_deepwalk.pdf")


def banana_log_density(points: np.ndarray) -> np.ndarray:
    x = points[:, 0]
    y = points[:, 1]
    curved = y + 0.18 * (x * x - 1.0)
    return -0.5 * ((x / 1.55) ** 2 + (curved / 0.48) ** 2)


def random_walk_metropolis(
    rng: np.random.Generator, n_steps: int = 4000, proposal_scale: float = 0.58
) -> tuple[np.ndarray, float]:
    samples = np.zeros((n_steps, 2), dtype=float)
    current = np.array([-2.25, -0.35], dtype=float)
    current_logp = banana_log_density(current.reshape(1, 2))[0]
    accepted = 0
    for i in range(n_steps):
        proposal = current + proposal_scale * rng.normal(size=2)
        proposal_logp = banana_log_density(proposal.reshape(1, 2))[0]
        if math.log(rng.random()) < proposal_logp - current_logp:
            current = proposal
            current_logp = proposal_logp
            accepted += 1
        samples[i] = current
    return samples, accepted / n_steps


def fig_mcmc(rng: np.random.Generator) -> None:
    samples, accept_rate = random_walk_metropolis(rng)

    x = np.linspace(-4.0, 4.0, 220)
    y = np.linspace(-2.2, 2.2, 180)
    xx, yy = np.meshgrid(x, y)
    grid = np.column_stack([xx.ravel(), yy.ravel()])
    density = np.exp(banana_log_density(grid)).reshape(xx.shape)

    fig, axes = plt.subplots(2, 1, figsize=(3.4, 4.15), sharex=True, sharey=True)
    levels = np.linspace(0.03, 0.95, 8)

    early = samples[:80]
    segments = np.stack([early[:-1], early[1:]], axis=1)
    lc = LineCollection(segments, colors=COLORS["gold"], linewidths=1.05, alpha=0.78)
    axes[0].contour(xx, yy, density, levels=levels, colors="#B6C2D2", linewidths=0.75)
    axes[0].add_collection(lc)
    axes[0].scatter(early[:, 0], early[:, 1], s=9, color=COLORS["gold"], edgecolor="white", linewidth=0.25, zorder=3)
    axes[0].scatter(early[0, 0], early[0, 1], s=28, color=COLORS["green"], edgecolor="white", linewidth=0.5, zorder=4)
    axes[0].set_title("first 80 Metropolis states")

    burn = samples[500:]
    axes[1].contour(xx, yy, density, levels=levels, colors="#B6C2D2", linewidths=0.75)
    axes[1].scatter(burn[:, 0], burn[:, 1], s=2.0, color=COLORS["blue"], alpha=0.23, rasterized=True)
    axes[1].text(
        2.15,
        -1.78,
        f"acceptance = {accept_rate:.2f}",
        ha="center",
        va="center",
        fontsize=7.2,
        color=COLORS["ink"],
        bbox=dict(boxstyle="round,pad=0.25", facecolor="#FFFFFF", edgecolor="#D1D5DB", linewidth=0.6),
    )
    axes[1].set_title("samples after burn-in")

    for ax in axes:
        ax.set_xlim(-3.8, 3.8)
        ax.set_ylim(-2.0, 2.0)
        ax.set_ylabel(r"$x_2$")
        clean_axis(ax)
    axes[1].set_xlabel(r"$x_1$")
    fig.subplots_adjust(hspace=0.26)
    save(fig, "fig_mcmc.pdf")


def main() -> None:
    set_style()
    rng = np.random.default_rng(SEED)
    fig_walks(rng)
    fig_clt(rng)
    fig_pagerank(rng)
    fig_diffusion(rng)
    fig_deepwalk(rng)
    fig_mcmc(rng)


if __name__ == "__main__":
    main()
