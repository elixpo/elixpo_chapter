from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta
from loguru import logger
import numpy as np


@dataclass
class LatencyMetrics:
    cache_lookup_ms: float = 0.0
    semantic_search_ms: float = 0.0
    web_search_ms: float = 0.0
    llm_inference_ms: float = 0.0
    total_ms: float = 0.0
    
    def __post_init__(self):
        if self.total_ms == 0.0:
            self.total_ms = (
                self.cache_lookup_ms + 
                self.semantic_search_ms + 
                self.web_search_ms + 
                self.llm_inference_ms
            )


@dataclass
class CostMetrics:
    compute_cost: float = 0.0
    token_cost: float = 0.0
    api_cost: float = 0.0
    cache_savings: float = 0.0
    
    @property
    def total_cost(self) -> float:
        return max(0.0, self.compute_cost + self.token_cost + self.api_cost - self.cache_savings)


@dataclass
class QualityMetrics:
    completeness: float = 0.0
    factuality: float = 0.0
    freshness: float = 0.0
    relevance: float = 0.0


class AspectCoverageEvaluator:
    
    def __init__(self):
        self.aspect_keywords = {
            "definition": {"define", "mean", "what is", "definition"},
            "history": {"history", "origin", "began", "started", "founded"},
            "current_state": {"current", "today", "now", "present"},
            "future": {"future", "will", "expected", "upcoming", "planned"},
            "comparison": {"vs", "versus", "difference", "compare", "different"},
            "why": {"why", "cause", "reason", "because", "due to"},
            "how": {"how", "process", "method", "way", "steps"},
            "benefits": {"benefit", "advantage", "good", "positive", "improve"},
            "risks": {"risk", "danger", "negative", "problem", "issue"},
            "examples": {"example", "instance", "such as", "e.g."},
        }
    
    def extract_query_aspects(self, query: str) -> List[str]:
        query_lower = query.lower()
        detected_aspects = []
        
        for aspect, keywords in self.aspect_keywords.items():
            if any(kw in query_lower for kw in keywords):
                detected_aspects.append(aspect)
        
        if not detected_aspects:
            detected_aspects = ["definition", "current_state"]
        
        return detected_aspects
    
    def compute_coverage_ratio(self,
                              query: str,
                              response: str,
                              extracted_sources: List[str]) -> float:
        required_aspects = set(self.extract_query_aspects(query))
        
        response_lower = response.lower()
        covered_aspects = set()
        
        for aspect, keywords in self.aspect_keywords.items():
            if aspect in required_aspects:
                if any(kw in response_lower for kw in keywords):
                    covered_aspects.add(aspect)
        
        source_count = len(extracted_sources)
        source_bonus = min(0.2, source_count * 0.05)
        
        if not required_aspects:
            return 0.5
        
        coverage_ratio = len(covered_aspects) / len(required_aspects)
        coverage_ratio = min(1.0, coverage_ratio + source_bonus)
        
        logger.debug(
            f"[AspectCoverage] ACR={coverage_ratio:.3f} "
            f"({len(covered_aspects)}/{len(required_aspects)} aspects, "
            f"{source_count} sources)"
        )
        
        return coverage_ratio


class FactualityEvaluator:
    
    def __init__(self):
        self.citation_quality_threshold = 0.8
    
    def evaluate_citations(self,
                          response: str,
                          sources: List[str],
                          citation_scores: Optional[List[float]] = None) -> float:
        if not sources:
            return 0.3
        
        response_lower = response.lower()
        cited_count = 0
        
        for source in sources:
            source_name = source.split('/')[-1] if '/' in source else source
            if source_name.lower() in response_lower:
                cited_count += 1
        
        citation_rate = cited_count / len(sources) if sources else 0.0
        
        confidence_score = 1.0
        if citation_scores and len(citation_scores) > 0:
            confidence_score = np.mean(citation_scores)
        
        trusted_domains = {
            'wikipedia.org', 'nature.com', 'science.org',
            'arxiv.org', '.edu', '.gov', 'research.org'
        }
        trusted_source_count = sum(
            1 for source in sources
            if any(domain in source for domain in trusted_domains)
        )
        
        source_quality_bonus = min(0.2, trusted_source_count * 0.05)
        
        factuality = (
            0.5 * citation_rate +
            0.3 * confidence_score +
            0.2 * source_quality_bonus
        )
        
        factuality = min(1.0, max(0.0, factuality))
        
        logger.debug(
            f"[Factuality] Score={factuality:.3f} "
            f"(citation_rate={citation_rate:.3f}, "
            f"confidence={confidence_score:.3f})"
        )
        
        return factuality


class FreshnessEvaluator:
    
    def __init__(self, acceptable_age_hours: int = 24):
        self.acceptable_age_hours = acceptable_age_hours
    
    def compute_freshness(self,
                         source_timestamps: List[datetime],
                         query_type: Optional[str] = None) -> float:
        if not source_timestamps:
            return 0.5
        
        most_recent = max(source_timestamps)
        age_hours = (datetime.now() - most_recent).total_seconds() / 3600
        
        acceptable_hours = self.acceptable_age_hours
        if query_type == "breaking_news":
            acceptable_hours = 1
        elif query_type == "temporal":
            acceptable_hours = 6
        elif query_type == "historical":
            acceptable_hours = 24 * 365
        
        freshness = max(0.0, 1.0 - (age_hours / acceptable_hours))
        freshness = min(1.0, freshness)
        
        logger.debug(
            f"[Freshness] Score={freshness:.3f} "
            f"(age={age_hours:.1f}h, acceptable={acceptable_hours}h)"
        )
        
        return freshness


class ConstrainedOptimizer:
    
    def __init__(self,
                 completeness_threshold: float = 0.75,
                 factuality_threshold: float = 0.70,
                 freshness_threshold: float = 0.60,
                 cost_weight_lambda: float = 0.1):
        self.completeness_threshold = completeness_threshold
        self.factuality_threshold = factuality_threshold
        self.freshness_threshold = freshness_threshold
        self.cost_weight_lambda = cost_weight_lambda
        
        self.aspect_evaluator = AspectCoverageEvaluator()
        self.factuality_evaluator = FactualityEvaluator()
        self.freshness_evaluator = FreshnessEvaluator()
        
        logger.info(
            f"[ConstrainedOptimizer] Initialized with constraints: "
            f"δ≥{completeness_threshold:.2f}, "
            f"ε≥{factuality_threshold:.2f}, "
            f"φ≥{freshness_threshold:.2f}, "
            f"λ={cost_weight_lambda:.2f}"
        )
    
    def check_feasibility(self, quality: QualityMetrics) -> Tuple[bool, Dict]:
        violations = {}
        
        if quality.completeness < self.completeness_threshold:
            violations["completeness"] = {
                "required": self.completeness_threshold,
                "actual": quality.completeness,
                "gap": self.completeness_threshold - quality.completeness
            }
        
        if quality.factuality < self.factuality_threshold:
            violations["factuality"] = {
                "required": self.factuality_threshold,
                "actual": quality.factuality,
                "gap": self.factuality_threshold - quality.factuality
            }
        
        if quality.freshness < self.freshness_threshold:
            violations["freshness"] = {
                "required": self.freshness_threshold,
                "actual": quality.freshness,
                "gap": self.freshness_threshold - quality.freshness
            }
        
        is_feasible = len(violations) == 0
        
        if not is_feasible:
            logger.warning(f"[ConstrainedOptimizer] Infeasible solution: {violations}")
        
        return is_feasible, violations
    
    def compute_objective(self,
                         latency: LatencyMetrics,
                         cost: CostMetrics) -> float:
        latency_term = latency.total_ms / 1000.0
        cost_term = cost.total_cost
        
        objective = latency_term + self.cost_weight_lambda * cost_term
        
        return objective
    
    def evaluate_solution(self,
                         query: str,
                         response: str,
                         latency: LatencyMetrics,
                         cost: CostMetrics,
                         sources: List[str],
                         source_timestamps: Optional[List[datetime]] = None,
                         citation_scores: Optional[List[float]] = None,
                         query_type: Optional[str] = None) -> Dict:
        completeness = self.aspect_evaluator.compute_coverage_ratio(
            query, response, sources
        )
        factuality = self.factuality_evaluator.evaluate_citations(
            response, sources, citation_scores
        )
        freshness = self.freshness_evaluator.compute_freshness(
            source_timestamps or [], query_type
        )
        
        quality = QualityMetrics(
            completeness=completeness,
            factuality=factuality,
            freshness=freshness,
            relevance=0.85
        )
        
        is_feasible, violations = self.check_feasibility(quality)
        objective_value = self.compute_objective(latency, cost)
        
        recommendations = []
        for constraint_name, constraint_data in violations.items():
            gap = constraint_data["gap"]
            if gap > 0.1:
                recommendations.append(
                    f"Increase {constraint_name} by {gap:.2f} "
                    f"(current: {constraint_data['actual']:.2f}, "
                    f"required: {constraint_data['required']:.2f})"
                )
        
        if latency.total_ms > 5000:
            recommendations.append(
                f"Latency high ({latency.total_ms:.0f}ms): "
                "Consider cache optimization or parallel retrieval"
            )
        
        if cost.total_cost > 0.50:
            recommendations.append(
                f"Cost high (${cost.total_cost:.2f}): "
                "Consider more selective source fetching"
            )
        
        return {
            "feasible": is_feasible,
            "objective_value": objective_value,
            "quality_metrics": {
                "completeness": quality.completeness,
                "factuality": quality.factuality,
                "freshness": quality.freshness,
                "relevance": quality.relevance
            },
            "performance_metrics": {
                "total_latency_ms": latency.total_ms,
                "total_cost_usd": cost.total_cost,
                "cost_per_query": cost.total_cost,
                "latency_per_query": latency.total_ms
            },
            "constraint_violations": violations,
            "recommendations": recommendations,
            "thresholds": {
                "completeness": self.completeness_threshold,
                "factuality": self.factuality_threshold,
                "freshness": self.freshness_threshold
            }
        }
