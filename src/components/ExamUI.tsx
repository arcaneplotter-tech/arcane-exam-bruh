import React, { useState, useEffect } from 'react';
import { Check, X, HelpCircle, Save, Mic, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { essayEvaluator, sfx } from '../utils';
import { Question } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Button = ({ children, className, variant = 'primary', size = 'md', isLoading, onClick, disabled, ...props }: any) => {
    const [ripples, setRipples] = useState<any[]>([]);
    const buttonRef = React.useRef<HTMLButtonElement>(null);
    const addRipple = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const id = Date.now();
        setRipples(prev => [...prev, { x, y, id }]);
        setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 600);
        if (onClick) onClick(e);
    };
    const variants: any = {
        primary: 'bg-indigo-600 text-white hover:brightness-110 shadow-lg shadow-indigo-500/30 border-transparent btn-hover-effect',
        secondary: 'bg-emerald-500 text-white hover:brightness-110 shadow-lg shadow-emerald-500/30 border-transparent btn-hover-effect',
        danger: 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/30 border-transparent btn-hover-effect',
        ghost: 'bg-transparent hover:bg-zinc-800 text-zinc-200 border-transparent btn-hover-effect',
        outline: 'bg-transparent border-indigo-500 text-indigo-400 hover:bg-indigo-500/10 border btn-hover-effect',
        ai: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-purple-500/30 border-transparent btn-hover-effect',
        success: 'bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-500/30 border-transparent btn-hover-effect'
    };
    const sizes: any = { sm: 'px-3 py-1.5 text-sm', md: 'px-5 py-2.5 text-base', lg: 'px-8 py-3.5 text-lg', icon: 'p-2.5' };
    return (
        <button
            ref={buttonRef}
            className={cn('relative overflow-hidden rounded-xl font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none hardware-accelerated', variants[variant], sizes[size], className)}
            onClick={addRipple}
            disabled={isLoading || disabled}
            {...props}
        >
            {ripples.map(ripple => (
                <span key={ripple.id} className="absolute bg-white/30 rounded-full animate-ping pointer-events-none" style={{ left: ripple.x, top: ripple.y, width: '20px', height: '20px', transform: 'translate(-50%, -50%)' }} />
            ))}
            <div className={cn("flex items-center justify-center gap-2", isLoading && "opacity-0")}>{children}</div>
            {isLoading && <div className="absolute inset-0 flex items-center justify-center"><div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" /></div>}
        </button>
    );
};

export const VoiceEssayInput = ({ value, onChange, disabled, placeholder, onSubmit }: any) => {
    return (
        <div className="relative">
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                placeholder={placeholder}
                className="w-full min-h-[200px] p-6 rounded-2xl bg-zinc-900 border-2 outline-none text-zinc-100 transition-all resize-y glass border-white/10 focus:border-indigo-500/50 focus:shadow-lg"
            />
            
            <div className="absolute bottom-4 right-4 flex gap-2">
                {value && onSubmit && (
                    <Button
                        variant="success"
                        size="icon"
                        onClick={onSubmit}
                        disabled={disabled}
                        title="Submit essay for evaluation"
                        className="shadow-lg"
                    >
                        <Check size={18} />
                    </Button>
                )}
                
                {value && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onChange('')}
                        disabled={disabled}
                        title="Clear text"
                    >
                        <Trash2 size={18} />
                    </Button>
                )}
            </div>
        </div>
    );
};

export const EnhancedQuestionCard = ({ question, selectedAnswer, onSelectAnswer, isReviewMode, isCorrect, showFeedback, onAddToBank, isMobile = false, settings }: any) => {
    const [showExplanation, setShowExplanation] = useState(false);
    const [essayFeedback, setEssayFeedback] = useState<any>(null);
    const [isEssaySubmitted, setIsEssaySubmitted] = useState(false);
    const isResultVisible = isReviewMode || (showFeedback && selectedAnswer && (!question.isEssay || isEssaySubmitted));
    const isDisabled = isReviewMode || (showFeedback && !!selectedAnswer && (!question.isEssay || isEssaySubmitted));
    
    useEffect(() => {
        if (isResultVisible && question.isEssay && selectedAnswer) {
            const feedback = essayEvaluator.getEssayFeedback(selectedAnswer, question.correctAnswer);
            setEssayFeedback(feedback);
        }
    }, [isResultVisible, question.isEssay, selectedAnswer, question.correctAnswer]);
    
    const getIsCorrect = () => {
        if (!selectedAnswer) return false;
        
        if (question.isEssay) {
            return essayEvaluator.evaluateEssayAnswer(selectedAnswer, question.correctAnswer);
        } else {
            return selectedAnswer === question.correctAnswer || 
                   selectedAnswer.startsWith(question.correctAnswer) ||
                   question.correctAnswer.startsWith(selectedAnswer);
        }
    };
    
    const isAnswerCorrect = getIsCorrect();
    
    const handleEssaySubmit = () => {
        if (selectedAnswer && selectedAnswer.trim().length > 0) {
            setIsEssaySubmitted(true);
            const feedback = essayEvaluator.getEssayFeedback(selectedAnswer, question.correctAnswer);
            setEssayFeedback(feedback);
            setShowExplanation(false);
            
            if (feedback.score >= 60) {
                sfx.success();
            } else {
                sfx.error();
            }
        }
    };
    
    return (
        <div className="flex flex-col gap-6 animate-slide-in-right w-full max-w-3xl mx-auto question-card-container">
            <div className="glass p-6 md:p-8 rounded-2xl shadow-xl transition-all duration-300 hover:shadow-2xl hover:bg-zinc-800/80">
                {question.imageUrl && (
                    <div className="mb-6 rounded-xl overflow-hidden border border-white/10 bg-black/20">
                        <img src={question.imageUrl} alt="Question Reference" className="w-full h-auto max-h-[300px] object-contain mx-auto" loading="lazy" />
                    </div>
                )}
                <div className="flex items-center justify-between mb-2">
                    <div className="flex gap-2">
                        {question.category && (
                            <span className="px-2 py-1 text-xs font-bold bg-indigo-500/20 text-indigo-400 rounded-full">
                                {question.category}
                            </span>
                        )}
                        {question.difficulty && (
                            <span className={cn(
                                "px-2 py-1 text-xs font-bold rounded-full",
                                question.difficulty === 'Easy' ? 'bg-green-500/20 text-green-500' :
                                question.difficulty === 'Medium' ? 'bg-yellow-500/20 text-yellow-500' :
                                'bg-red-500/20 text-red-500'
                            )}>
                                {question.difficulty}
                            </span>
                        )}
                    </div>
                    {question.isEssay && (
                        <span className="px-2 py-1 text-xs font-bold bg-purple-500/20 text-purple-500 rounded-full">
                            Essay
                        </span>
                    )}
                </div>
                <h3 className="text-lg md:text-xl font-semibold leading-relaxed text-zinc-100">{question.text}</h3>
                
                {(isResultVisible || isReviewMode) && question.explanation && (
                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowExplanation(!showExplanation)}
                            className="flex items-center gap-2"
                        >
                            <HelpCircle size={16} />
                            {showExplanation ? "Hide Explanation" : "Explain This Question"}
                        </Button>
                        {!isReviewMode && onAddToBank && (
                            <Button
                                variant="success"
                                size="sm"
                                onClick={() => {
                                    if (onAddToBank) {
                                        onAddToBank(question);
                                    }
                                }}
                                className="flex items-center gap-2 hover:scale-105 transition-transform"
                                title="Save this question to your question bank"
                            >
                                <Save size={16} />
                                Save to Bank
                            </Button>
                        )}
                    </div>
                )}
            </div>
            
            {showExplanation && question.explanation && (
                <div className="glass p-6 rounded-2xl border border-blue-500/30 bg-blue-500/5 animate-fade-in">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                            <HelpCircle size={14} className="text-blue-400" />
                        </div>
                        <h4 className="font-bold text-blue-400">Explanation</h4>
                    </div>
                    <p className="text-zinc-200 leading-relaxed">{question.explanation}</p>
                    {question.isEssay && (
                        <div className="mt-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                            <p className="text-sm text-blue-300 font-medium mb-1">Essay Tips:</p>
                            <p className="text-sm text-blue-200">Focus on key concepts and provide clear examples in your response.</p>
                        </div>
                    )}
                </div>
            )}
            
            <div className="flex flex-col gap-3">
                {question.isEssay ? (
                    <div className="relative animate-fade-in-up">
                        <VoiceEssayInput
                            value={selectedAnswer || ''}
                            onChange={(text: string) => {
                                if (!isDisabled && !isEssaySubmitted) {
                                    onSelectAnswer(text);
                                    setIsEssaySubmitted(false);
                                    setEssayFeedback(null);
                                    setShowExplanation(false);
                                }
                            }}
                            onSubmit={showFeedback && !isReviewMode ? handleEssaySubmit : null}
                            disabled={isDisabled}
                            placeholder="Type your answer here..."
                        />
                        {showFeedback && !isReviewMode && !isEssaySubmitted && selectedAnswer && selectedAnswer.trim().length > 0 && (
                            <div className="mt-4 flex justify-center">
                                <Button
                                    variant="primary"
                                    onClick={handleEssaySubmit}
                                    className="flex items-center gap-2"
                                >
                                    <Check size={16} />
                                    Submit Essay for Evaluation
                                </Button>
                            </div>
                        )}
                        {isResultVisible && essayFeedback && (
                            <div className="mt-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 animate-fade-in">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-bold text-blue-400">Essay Evaluation</h4>
                                    <div className={cn(
                                        "px-3 py-1 rounded-full text-sm font-bold",
                                        essayFeedback.score >= 90 ? "bg-green-500/20 text-green-500" :
                                        essayFeedback.score >= 75 ? "bg-yellow-500/20 text-yellow-500" :
                                        essayFeedback.score >= 60 ? "bg-orange-500/20 text-orange-500" :
                                        "bg-red-500/20 text-red-500"
                                    )}>
                                        Score: {essayFeedback.score}%
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm"><span className="font-medium text-blue-300">Grade:</span> {essayFeedback.grade}</p>
                                    <p className="text-sm"><span className="font-medium text-blue-300">Feedback:</span> {essayFeedback.feedback}</p>
                                    {essayFeedback.studentKeyTerms.length > 0 && (
                                        <div className="mt-2">
                                            <p className="text-xs text-blue-300 font-medium mb-1">Key terms you mentioned:</p>
                                            <div className="flex flex-wrap gap-1">
                                                {essayFeedback.studentKeyTerms.map((term: string, idx: number) => (
                                                    <span key={idx} className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded">
                                                        {term}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="mt-3 pt-3 border-t border-blue-500/20">
                                        <p className="text-sm text-blue-300 font-medium mb-1">Expected Key Points:</p>
                                        <p className="text-sm text-zinc-200">{question.correctAnswer}</p>
                                    </div>
                                    {question.explanation && (
                                        <div className="mt-2 pt-2 border-t border-blue-500/20">
                                            <p className="text-xs text-blue-300 font-medium">Additional Explanation:</p>
                                            <p className="text-xs text-blue-200">{question.explanation}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    question.options.map((option: string, idx: number) => {
                        const isSelected = selectedAnswer === option;
                        const isOptionCorrect = essayEvaluator.isCorrect(option, question.correctAnswer, false);
                        
                        let variantStyles = "border-white/10 hover:border-indigo-500/50 hover:bg-white/5";
                        let circleStyles = "border-zinc-500 group-hover:border-indigo-500";
                        let icon = null;
                        let animationClass = "animate-fade-in-up";
                        let feedbackClass = "";
                        
                        if (isResultVisible) {
                            if (isOptionCorrect) {
                                variantStyles = "border-green-500/50 bg-green-500/5 answer-correct"; 
                                circleStyles = "border-green-500 bg-green-500 text-white shadow-lg shadow-green-500/30"; 
                                icon = <Check size={16} strokeWidth={3} />; 
                                animationClass = "animate-success-pop";
                                feedbackClass = "answer-correct";
                            } else if (isSelected) {
                                variantStyles = "border-red-500/50 bg-red-500/5 answer-incorrect"; 
                                circleStyles = "border-red-500 bg-red-500 text-white shadow-lg shadow-red-500/30"; 
                                icon = <X size={16} strokeWidth={3} />; 
                                animationClass = "animate-shake";
                                feedbackClass = "answer-incorrect";
                            } else {
                                variantStyles = "border-transparent opacity-40"; 
                                circleStyles = "border-white/20 text-transparent";
                            }
                        } else if (isSelected) {
                            variantStyles = "border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/20"; 
                            circleStyles = "border-indigo-500 bg-indigo-500 text-white"; 
                            icon = <div className="w-2.5 h-2.5 bg-white rounded-full animate-bounce-soft" />; 
                            animationClass = "animate-select-pop";
                        }
                        
                        const delay = animationClass === "animate-fade-in-up" ? `${idx * 75}ms` : '0ms';
                        return (
                            <button
                                key={idx} 
                                onClick={() => {
                                    if (!isDisabled) {
                                        onSelectAnswer(option);
                                        setShowExplanation(false);
                                    }
                                }} 
                                disabled={isDisabled} 
                                style={{ animationDelay: delay }}
                                className={cn("group relative flex items-center gap-4 p-4 md:p-5 rounded-xl border-2 text-left transition-all duration-300 hardware-accelerated glass opacity-0", variantStyles, animationClass, feedbackClass)}
                            >
                                <div className={cn("w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0", circleStyles)}>
                                    {icon}
                                </div>
                                <span className={cn("text-base md:text-lg font-medium transition-colors", isSelected || (isResultVisible && isOptionCorrect) ? "text-zinc-100" : "text-zinc-300")}>
                                    {option}
                                </span>
                            </button>
                        );
                    })
                )}
            </div>
            
            {isMobile && (isReviewMode || showFeedback) && (
                <div className="swipe-hint hidden md:hidden">
                    <div className="swipe-arrows">
                        <ChevronLeft size={12} className="swipe-arrow" />
                        <span className="text-xs">Swipe to navigate</span>
                        <ChevronRight size={12} className="swipe-arrow" />
                    </div>
                </div>
            )}
        </div>
    );
};

export const QuestionMap = React.memo(({ totalQuestions, currentIndex, answers, flagged, onNavigate, className, isReviewMode, correctAnswers, showInstantFeedback }: any) => {
    return (
        <div className={cn("grid grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3 content-start p-1", className)}>
            {Array.from({ length: totalQuestions }).map((_, idx) => {
                const isAnswered = answers[idx] !== undefined;
                const isCurrent = currentIndex === idx;
                const isFlagged = flagged.has(idx);
                let isCorrect = undefined;
                if (isReviewMode) isCorrect = correctAnswers?.[idx];
                else if (showInstantFeedback && isAnswered) isCorrect = correctAnswers?.[idx];
                let statusColor = "bg-zinc-800 border-white/10 text-zinc-400 hover:border-indigo-500/50";
                if (isCorrect === true) statusColor = "bg-green-500 border-green-500 text-white";
                else if (isCorrect === false) statusColor = "bg-red-500 border-red-500 text-white";
                else {
                    if (isAnswered) statusColor = "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20";
                    else if (isFlagged) statusColor = "bg-yellow-500 border-yellow-500 text-white";
                }
                if (isCurrent) statusColor = "bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-500/20 scale-110 z-10";
                return (
                    <button key={idx} onClick={() => onNavigate(idx)} className={cn("relative aspect-square rounded-xl border flex items-center justify-center text-sm font-bold transition-all duration-200 hardware-accelerated btn-hover-effect", statusColor)}>
                        {idx + 1}
                        {isFlagged && !isReviewMode && !isCorrect && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-zinc-900 shadow-sm" />}
                    </button>
                );
            })}
        </div>
    );
});
