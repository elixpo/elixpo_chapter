# QFabric manuscript

The manuscript is a two-column IEEEtran paper prepared for arXiv (cs.AR),
backed by the Stage 12 matched-load campaign and the Stage 1 interconnect
evidence. Every quantitative table, figure, and macro is generated from raw
traces by `scripts/generate-*-assets.py`, never copied by hand.

Build from this directory with:

    make

The output is qfabric-paper.pdf. The included landscape photograph at
paper/figures/testbed.jpg shows the physical testbed with identifying details
redacted. Replace that file and rebuild if a newer capture is required.

`make arxiv` writes `qfabric-arxiv.tar.gz`, a self-contained source bundle
that compiles with pdflatex and the included `.bbl`. The plain-text abstract
for the arXiv form is in `arxiv-abstract.txt`.

## License

The manuscript, its LaTeX source, original figures and tables, and testbed
photograph are © 2026 Ayushman Bhattacharya and Anwesha Chakraborty and
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The
software and asset generators remain Apache-2.0. See [LICENSE.md](LICENSE.md).
