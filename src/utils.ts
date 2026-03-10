export class EssayEvaluator {
    stopWords: Set<string>;
    constructor() {
        this.stopWords = new Set([
            'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
            'should', 'can', 'could', 'may', 'might', 'must', 'not', 'no', 'yes',
            'it', 'its', 'it\'s', 'that', 'this', 'these', 'those', 'as', 'so',
            'if', 'then', 'else', 'when', 'where', 'why', 'how', 'what', 'which',
            'who', 'whom', 'whose', 'there', 'here', 'up', 'down', 'out', 'off',
            'over', 'under', 'again', 'further', 'once', 'more', 'most', 'such',
            'own', 'same', 'too', 'very', 'just', 'also', 'now', 'then', 'well',
            'only', 'very', 'even', 'back', 'any', 'each', 'both', 'between',
            'through', 'during', 'before', 'after', 'above', 'below', 'from'
        ]);
    }
    
    normalize(text: string) {
        if (!text || typeof text !== 'string') return '';
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    tokenize(text: string) {
        const normalized = this.normalize(text);
        if (!normalized) return [];
        return normalized.split(' ');
    }
    
    getKeyTerms(text: string) {
        const tokens = this.tokenize(text);
        return new Set(
            tokens.filter(token => 
                token.length > 2 && 
                !this.stopWords.has(token) &&
                !/^\d+$/.test(token)
            ).map(token => {
                let stemmed = token;
                if (stemmed.endsWith('ing')) stemmed = stemmed.slice(0, -3);
                else if (stemmed.endsWith('ed')) stemmed = stemmed.slice(0, -2);
                else if (stemmed.endsWith('s') && !stemmed.endsWith('ss')) stemmed = stemmed.slice(0, -1);
                else if (stemmed.endsWith('es')) stemmed = stemmed.slice(0, -2);
                else if (stemmed.endsWith('ies')) stemmed = stemmed.slice(0, -3) + 'y';
                else if (stemmed.endsWith('ly')) stemmed = stemmed.slice(0, -2);
                else if (stemmed.endsWith('ment')) stemmed = stemmed.slice(0, -4);
                return stemmed;
            }).filter(term => term.length > 2)
        );
    }
    
    calculateSimilarity(text1: string, text2: string) {
        if (!text1 || !text2) return 0;
        
        const terms1 = this.getKeyTerms(text1);
        const terms2 = this.getKeyTerms(text2);
        
        if (terms1.size === 0 || terms2.size === 0) return 0;
        
        const intersection = new Set([...terms1].filter(term => terms2.has(term)));
        const union = new Set([...terms1, ...terms2]);
        
        return intersection.size / union.size;
    }
    
    evaluateEssayAnswer(studentAnswer: string, correctAnswer: string) {
        if (!studentAnswer || !correctAnswer) return false;
        
        if (studentAnswer.trim().length < 20) return false;
        
        const similarity = this.calculateSimilarity(studentAnswer, correctAnswer);
        
        const studentTerms = this.getKeyTerms(studentAnswer);
        const correctTerms = this.getKeyTerms(correctAnswer);
        
        if (studentTerms.size === 0 || correctTerms.size === 0) return false;
        
        const intersection = new Set([...studentTerms].filter(term => correctTerms.has(term)));
        const coverage = intersection.size / correctTerms.size;
        
        return similarity > 0.2 || coverage > 0.3;
    }
    
    getEssayScore(studentAnswer: string, correctAnswer: string) {
        if (!studentAnswer || !correctAnswer) return 0;
        
        const similarity = this.calculateSimilarity(studentAnswer, correctAnswer);
        
        const studentTerms = this.getKeyTerms(studentAnswer);
        const correctTerms = this.getKeyTerms(correctAnswer);
        
        if (studentTerms.size === 0 || correctTerms.size === 0) return 0;
        
        const intersection = new Set([...studentTerms].filter(term => correctTerms.has(term)));
        const coverage = intersection.size / Math.max(correctTerms.size, 1);
        
        let baseScore = (similarity * 0.4 + coverage * 0.6) * 100;
        
        const lengthScore = Math.min(studentAnswer.length / 150, 25);
        
        const hasParagraphs = (studentAnswer.match(/\n\n/g) || []).length >= 1;
        const structureBonus = hasParagraphs ? 5 : 0;
        
        const totalScore = Math.min(baseScore + lengthScore + structureBonus, 100);
        
        return Math.round(totalScore);
    }
    
    getEssayFeedback(studentAnswer: string, correctAnswer: string) {
        const score = this.getEssayScore(studentAnswer, correctAnswer);
        
        let grade = '';
        let feedback = '';
        
        if (score >= 90) {
            grade = 'Excellent';
            feedback = 'Outstanding answer! Covers all key concepts with excellent explanation and structure.';
        } else if (score >= 80) {
            grade = 'Very Good';
            feedback = 'Strong answer. Covers most key points with good detail and organization.';
        } else if (score >= 70) {
            grade = 'Good';
            feedback = 'Good effort. Covers main concepts but could use more depth or examples.';
        } else if (score >= 60) {
            grade = 'Satisfactory';
            feedback = 'Addresses the question but misses some important points or lacks detail.';
        } else if (score >= 50) {
            grade = 'Needs Improvement';
            feedback = 'Partially correct but missing major concepts or sufficient explanation.';
        } else {
            grade = 'Poor';
            feedback = 'Does not adequately address the question. Please review the topic thoroughly.';
        }
        
        const correctTerms = Array.from(this.getKeyTerms(correctAnswer));
        const studentTerms = Array.from(this.getKeyTerms(studentAnswer));
        const missingTerms = correctTerms.filter(term => !studentTerms.includes(term));
        
        return {
            score,
            grade,
            feedback,
            studentKeyTerms: studentTerms.slice(0, 10),
            missingKeyTerms: missingTerms.slice(0, 5),
            length: studentAnswer.length,
            hasParagraphs: (studentAnswer.match(/\n\n/g) || []).length >= 1
        };
    }
    
    isCorrect(studentAnswer: string, correctAnswer: string, isEssay = false) {
        if (!studentAnswer || !correctAnswer) return false;
        
        if (isEssay) {
            return this.evaluateEssayAnswer(studentAnswer, correctAnswer);
        } else {
            return studentAnswer === correctAnswer || 
                   studentAnswer.startsWith(correctAnswer) ||
                   correctAnswer.startsWith(studentAnswer);
        }
    }
}

export const essayEvaluator = new EssayEvaluator();

export class SoundManager {
    ctx: AudioContext | null;
    enabled: boolean;
    constructor() {
        this.ctx = null;
        this.enabled = true;
        if (typeof window !== 'undefined') {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
    }
    playTone(freq: number, type: OscillatorType, duration: number, vol = 0.1) {
        if (!this.enabled || !this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(vol, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {}
    }
    click() { this.playTone(600, 'sine', 0.1, 0.05); }
    success() { this.playTone(500, 'sine', 0.1, 0.1); setTimeout(() => this.playTone(800, 'sine', 0.2, 0.1), 100); }
    error() { this.playTone(300, 'sawtooth', 0.15, 0.08); setTimeout(() => this.playTone(200, 'sawtooth', 0.15, 0.08), 100); }
    start() { this.playTone(400, 'triangle', 0.1); setTimeout(() => this.playTone(600, 'triangle', 0.4), 100); }
}
export const sfx = new SoundManager();
