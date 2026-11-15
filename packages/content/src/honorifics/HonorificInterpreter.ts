/**
 * Thuật toán A6 & GoF Interpreter Pattern (21)
 * Diễn giải ngữ cảnh (Tuổi, Giới tính, Quan hệ, Mức độ trang trọng sân đình/xã hội)
 * thành cặp đại từ xưng hô tiếng Việt chuẩn xác (20 cặp quan hệ điển hình).
 */

import pairsData from '../data/honorifics.json' with { type: 'json' };

export type RelationCategory = 'kin' | 'social' | 'teacher_student' | 'stranger' | 'work' | 'civic' | 'traditional';

export type FormalityLevel = 'formal' | 'polite' | 'intimate';

export interface ContextExpression {
  speakerAge: number;
  listenerAge: number;
  relation: RelationCategory;
  listenerGender?: 'male' | 'female' | 'neutral';
  formality?: FormalityLevel;
  speakerGender?: 'male' | 'female';
  pairId?: string;
}

export interface HonorificInterpretationResult {
  speaker: string;
  listener: string;
  politeParticle: string;
  explanation: string;
  sampleSentence: string;
  wisdomTip: string;
  pairId: string;
  category: RelationCategory;
}

export interface HonorificPairItem {
  id: string;
  relation: RelationCategory;
  category: string;
  relationName: string;
  speakerAge: number;
  listenerAge: number;
  speaker: string;
  listener: string;
  politeParticle: string;
  ageRelationText: string;
  contextLevelText: string;
  example: string;
  explanation: string;
  wisdom: string;
  listenerGender?: 'male' | 'female' | 'neutral';
  speakerGender?: 'male' | 'female';
}

/**
 * 20 cặp quan hệ mẫu: NGUỒN DUY NHẤT là src/data/honorifics.json (sửa nội dung ở đó).
 * Hình dạng dữ liệu được kiểm tra trong test/honorific.test.mjs.
 */
export const HONORIFIC_PAIRS_20 = pairsData as HonorificPairItem[];

export class HonorificInterpreter {
  /**
   * Diễn giải ngữ cảnh thành kết quả xưng hô chuẩn xác
   */
  public interpret(ctx: ContextExpression): HonorificInterpretationResult {
    // 0. Nếu có yêu cầu trực tiếp pairId cụ thể từ Drawer hoặc kịch bản
    if (ctx.pairId) {
      const explicit = this.getPairById(ctx.pairId);
      if (explicit) {
        return this.formatPairResult(explicit, ctx);
      }
    }

    const ageDiff = ctx.listenerAge - ctx.speakerAge;
    const formality = ctx.formality || 'polite';

    // 1. Thầy trò (teacher_student)
    if (ctx.relation === 'teacher_student') {
      if (ctx.speakerAge < ctx.listenerAge) {
        let listenerTitle = 'thầy/cô';
        let particle = 'Thưa Thầy/Cô... ạ';
        let sentence = 'Em kính chào Thầy Cô ạ, thưa Thầy Cô bài giảng về phong tục làng xã hôm nay rất sâu sắc ạ!';

        if (ctx.listenerGender === 'female') {
          listenerTitle = 'cô';
          particle = 'Thưa Cô... ạ';
          sentence = 'Em kính chào Cô ạ, thưa Cô bài giảng về phong tục làng xã hôm nay rất sâu sắc ạ!';
        } else if (ctx.listenerGender === 'male') {
          listenerTitle = 'thầy';
          particle = 'Thưa Thầy... ạ';
          sentence = 'Em kính chào Thầy ạ, thưa Thầy bài giảng về phong tục làng xã hôm nay rất sâu sắc ạ!';
        }

        return {
          speaker: 'em',
          listener: listenerTitle,
          politeParticle: particle,
          explanation: 'Quan hệ sư đồ: người học xưng em, kính gọi thầy cô giáo kèm trợ từ thưa gửi.',
          sampleSentence: sentence,
          wisdomTip: 'Tôn sư trọng đạo! Một chữ là thầy, nửa chữ cũng là thầy; cách xưng hô đo lường nếp học người xưa.',
          pairId: 'h8',
          category: 'teacher_student'
        };
      } else {
        let speakerTitle = 'thầy/cô';
        let sentence = 'Thầy cô khen em hôm nay đã có tinh thần tìm hiểu sâu về di sản văn hóa dân tộc nhé!';

        if (ctx.speakerGender === 'female') {
          speakerTitle = 'cô';
          sentence = 'Cô khen em hôm nay đã có tinh thần tìm hiểu sâu về di sản văn hóa dân tộc nhé!';
        } else if (ctx.speakerGender === 'male') {
          speakerTitle = 'thầy';
          sentence = 'Thầy khen em hôm nay đã có tinh thần tìm hiểu sâu về di sản văn hóa dân tộc nhé!';
        }

        return {
          speaker: speakerTitle,
          listener: 'em',
          politeParticle: 'nhé / các em nhé',
          explanation: 'Thầy cô bảo ban học trò: xưng thầy/cô, gọi em.',
          sampleSentence: sentence,
          wisdomTip: 'Lời thầy nhẹ nhàng ấm áp gieo niềm say mê kiến thức vào lòng người học.',
          pairId: 'h9',
          category: 'teacher_student'
        };
      }
    }

    // 2. Tôn giáo thiền môn cổ tự (traditional - intimate/spiritual)
    if (ctx.relation === 'traditional' && formality === 'intimate') {
      return {
        speaker: 'con',
        listener: 'thầy / sư thầy',
        politeParticle: 'A di đà Phật / Bạch Thầy',
        explanation: 'Chốn cửa Phật hoặc tín ngưỡng dân gian, phật tử xưng con, kính gọi quý thầy là Sư thầy.',
        sampleSentence: 'A di đà Phật, bạch Thầy cho con xin phép được cúng dường hoa quả thanh tịnh lên Tam Bảo ạ!',
        wisdomTip: 'Tâm tĩnh thì trí sáng. Đến chốn tôn nghiêm, từng lời thưa gửi phải khiêm cung lắng đọng tâm từ.',
        pairId: 'h18',
        category: 'traditional'
      };
    }

    // 3. Nghi lễ đình làng / Diễn văn cộng đồng
    if (ctx.relation === 'traditional' || (ctx.relation === 'civic' && formality === 'formal' && ctx.listenerAge >= 50)) {
      if (ctx.listenerAge >= 70) {
        return {
          speaker: 'cháu',
          listener: 'cụ',
          politeParticle: 'Dạ thưa Cụ... ạ',
          explanation: 'Tôn ti sân đình: đối với bậc thượng thọ cao niên, xưng cháu/con và kính cẩn gọi Cụ.',
          sampleSentence: 'Dạ thưa Cụ, cháu xin phép dâng chén trà sen kính mời Cụ xơi nước ạ!',
          wisdomTip: 'Kính lão đắc thọ! Chốn đình làng tôn ti trật tự, tiếng chào cung kính trước bậc cao niên thể hiện nếp nhà gia phong.',
          pairId: 'h1',
          category: 'traditional'
        };
      }
      return {
        speaker: 'tôi',
        listener: 'quý vị / các cụ',
        politeParticle: 'Kính thưa... ạ',
        explanation: 'Diễn văn sân đình: xưng tôi và kính chào quý vị quan viên, bô lão.',
        sampleSentence: 'Kính thưa quý vị quan viên hai họ và bà con chòm xóm, tôi xin phép được khai mạc hội làng!',
        wisdomTip: 'Lời nói chốn ba quân, câu chào nơi sân đình! Nghi thức phát biểu cần đĩnh đạc, trang nghiêm và tề chỉnh.',
        pairId: 'h17',
        category: 'traditional'
      };
    }

    // 4. Công việc / Đoàn thể
    if (ctx.relation === 'work' || ctx.relation === 'civic') {
      if (formality === 'formal' || ctx.relation === 'civic') {
        return {
          speaker: 'tôi',
          listener: 'đồng chí',
          politeParticle: 'thưa / báo cáo',
          explanation: 'Công việc đoàn thể chính quy: xưng tôi, gọi đồng chí.',
          sampleSentence: 'Báo cáo đồng chí, công tác tu bổ vì kèo mái đình và sân gạch cổ đã hoàn tất chu đáo.',
          wisdomTip: 'Chung một ngọn cờ, đồng lòng góp sức vì lợi ích chung của cộng đồng.',
          pairId: 'h20',
          category: 'civic'
        };
      }

      let listenerTitle = 'anh/chị/bác';
      if (ctx.listenerGender === 'female') listenerTitle = 'chị';
      else if (ctx.listenerGender === 'male') listenerTitle = 'anh';

      return {
        speaker: 'tôi',
        listener: listenerTitle,
        politeParticle: 'ạ / xin phép... ạ',
        explanation: 'Công sở lịch thiệp: xưng tôi, gọi anh/chị/bác.',
        sampleSentence: `Tôi xin phép được gửi biên bản họp đình làng đến ${listenerTitle} để ${listenerTitle} rà soát giúp ạ.`,
        wisdomTip: "Việc công minh bạch, xưng hô rõ ràng. 'Tôi' tự chủ mà vẫn cung kính đối phương.",
        pairId: 'h16',
        category: 'work'
      };
    }

    // 5. Gia đình & Họ tộc (kin)
    if (ctx.relation === 'kin') {
      // 5.1 Bậc thượng thọ (cụ)
      if (ctx.listenerAge >= 75) {
        return {
          speaker: 'cháu',
          listener: 'cụ',
          politeParticle: 'Dạ thưa Cụ... ạ',
          explanation: 'Bậc cụ thượng thọ: xưng cháu/con, gọi Cụ.',
          sampleSentence: 'Dạ thưa Cụ, cháu xin phép dâng chén trà sen kính mời Cụ xơi nước ạ!',
          wisdomTip: 'Kính già, già để tuổi cho! Lời xưng hô lễ độ gìn giữ nếp nhà phúc đức.',
          pairId: 'h1',
          category: 'kin'
        };
      }

      // 5.2 Bậc ông bà (ageDiff >= 40 hoặc listenerAge >= 65)
      if (ageDiff >= 40 || ctx.listenerAge >= 65) {
        let listenerTitle = 'ông/bà';
        let sample = 'Dạ thưa Ông Bà, cháu mới đi học về, cháu kính chúc Ông Bà dồi dào sức khỏe ạ!';
        if (ctx.listenerGender === 'female') {
          listenerTitle = 'bà';
          sample = 'Dạ thưa Bà, cháu mới đi học về, cháu kính chúc Bà dồi dào sức khỏe ạ!';
        } else if (ctx.listenerGender === 'male') {
          listenerTitle = 'ông';
          sample = 'Dạ thưa Ông, cháu mới đi học về, cháu kính chúc Ông dồi dào sức khỏe ạ!';
        }

        return {
          speaker: 'cháu',
          listener: listenerTitle,
          politeParticle: 'Dạ... ạ',
          explanation: 'Bậc ông bà: con cháu xưng cháu, gọi ông hoặc bà tôn kính.',
          sampleSentence: sample,
          wisdomTip: 'Uống nước nhớ nguồn! Lời chào ông bà mỗi sớm mai là nét đẹp hiếu đễ ngàn đời.',
          pairId: 'h2',
          category: 'kin'
        };
      }

      // 5.3 Bậc cha mẹ (formality === 'intimate' trong độ tuổi chênh lệch cha mẹ)
      if (formality === 'intimate' && ageDiff >= 20 && ageDiff < 40) {
        let listenerTitle = 'bố/mẹ';
        let sample = 'Con thưa Bố Mẹ, con xin phép được chuẩn bị mâm cơm chiều gia đình ạ!';
        if (ctx.listenerGender === 'female') {
          listenerTitle = 'mẹ';
          sample = 'Con thưa Mẹ, con xin phép được chuẩn bị mâm cơm chiều gia đình ạ!';
        } else if (ctx.listenerGender === 'male') {
          listenerTitle = 'bố';
          sample = 'Con thưa Bố, con xin phép được chuẩn bị mâm cơm chiều gia đình ạ!';
        }

        return {
          speaker: 'con',
          listener: listenerTitle,
          politeParticle: 'Dạ thưa... ạ',
          explanation: 'Con cái đối với cha mẹ xưng con, kính gọi bố mẹ.',
          sampleSentence: sample,
          wisdomTip: 'Công cha như núi Thái Sơn, nghĩa mẹ như nước trong nguồn chảy ra. Luôn thưa gửi khi đi đến nơi về đến chốn.',
          pairId: 'h6',
          category: 'kin'
        };
      }

      // 5.4 Hàng cô chú bác họ hàng (12 <= ageDiff < 40)
      if (ageDiff >= 12) {
        if (ctx.listenerGender === 'female') {
          // Kiểm tra xem là Thím/Mợ hay Cô/Dì
          return {
            speaker: 'cháu',
            listener: 'cô/dì',
            politeParticle: 'Dạ... ạ',
            explanation: 'Bề trên hàng cô/dì hoặc bác gái: xưng cháu, gọi cô hoặc dì ngọt ngào hiền hậu.',
            sampleSentence: 'Dạ cháu chào Cô ạ, Cô mới đi chợ làng về có mua bánh đúc lạc không Cô?',
            wisdomTip: 'Máu chảy ruột mềm! Xưng hô ngọt ngào với cô dì làm thắm đượm tình thân gia quyến.',
            pairId: 'h5',
            category: 'kin'
          };
        } else if (ctx.listenerGender === 'male') {
          if (ageDiff >= 25) {
            return {
              speaker: 'cháu',
              listener: 'bác',
              politeParticle: 'Dạ... ạ',
              explanation: 'Anh của cha mẹ hoặc người trạc tuổi cha mẹ: xưng cháu, kính gọi Bác.',
              sampleSentence: 'Cháu chào Bác ạ! Bác sang chơi xơi nước với bố cháu nhé ạ!',
              wisdomTip: "Gọi 'Bác' xưng 'Cháu' vừa bày tỏ lòng kính trọng bề trên, vừa tạo sự ấm áp như người một nhà.",
              pairId: 'h3',
              category: 'kin'
            };
          }
          return {
            speaker: 'cháu',
            listener: 'chú',
            politeParticle: 'Dạ... ạ',
            explanation: 'Em trai của cha gọi là Chú: xưng cháu, gọi chú thân mật.',
            sampleSentence: 'Cháu chào Chú ạ, hôm nay Chú ra đình làng xem hội rước kiệu có vui không ạ?',
            wisdomTip: 'Sẩy cha còn chú! Chú bác trong họ luôn là điểm tựa chỉ bảo đường ăn nết ở cho con cháu.',
            pairId: 'h4',
            category: 'kin'
          };
        } else {
          return {
            speaker: 'cháu',
            listener: 'bác/chú',
            politeParticle: 'Dạ... ạ',
            explanation: 'Bề trên hàng chú bác trong họ: con cháu xưng cháu, gọi bác/chú.',
            sampleSentence: 'Cháu chào Bác ạ! Bác sang chơi xơi nước với gia đình cháu nhé ạ!',
            wisdomTip: 'Kính trên nhường dưới, tiếng thưa dạ mở lối cho mọi mối thâm tình.',
            pairId: 'h3',
            category: 'kin'
          };
        }
      }

      // 5.5 Người lớn tuổi nói với thế hệ con cháu (ageDiff <= -12)
      if (ageDiff <= -12) {
        let speakerTitle = 'bác';
        let sample = 'Bác chào cháu nhé, cháu ngoan lắm, lại đây bác cho quả thị thơm của vườn đình!';

        if (ctx.speakerGender === 'female') {
          speakerTitle = ageDiff <= -35 ? 'bà' : 'cô';
          sample = `${speakerTitle.charAt(0).toUpperCase() + speakerTitle.slice(1)} chào cháu nhé, cháu ngoan lắm, lại đây ${speakerTitle} cho quả thị thơm của vườn đình!`;
        } else if (ctx.speakerGender === 'male') {
          speakerTitle = ageDiff <= -35 ? 'ông' : (ageDiff <= -25 ? 'bác' : 'chú');
          sample = `${speakerTitle.charAt(0).toUpperCase() + speakerTitle.slice(1)} chào cháu nhé, cháu ngoan lắm, lại đây ${speakerTitle} cho quả thị thơm của vườn đình!`;
        }

        return {
          speaker: speakerTitle,
          listener: 'cháu',
          politeParticle: 'nhé / nha cháu',
          explanation: 'Bề trên với con cháu: xưng danh xưng thế hệ mình, gọi cháu ân cần.',
          sampleSentence: sample,
          wisdomTip: 'Yêu trẻ, trẻ đến nhà! Lời xưng hô hiền hậu của bậc cao niên gieo mầm lễ giáo cho con trẻ.',
          pairId: 'h7',
          category: 'kin'
        };
      }

      // 5.6 Anh chị em trong họ (thế hệ ngang hàng gần tuổi)
      if (ageDiff > 0) {
        const title = ctx.listenerGender === 'female' ? 'chị' : 'anh';
        return {
          speaker: 'em',
          listener: title,
          politeParticle: `ạ / nhé ${title}`,
          explanation: `Anh chị em trong họ: nhỏ tuổi hơn xưng em, gọi ${title}.`,
          sampleSentence: `Em chào ${title}, ${title} cho em hỏi thăm đường vào sân đình làng mình với ạ!`,
          wisdomTip: 'Anh em như thể tay chân, rách lành đùm bọc dở hay đỡ đần.',
          pairId: ctx.listenerGender === 'female' ? 'h11' : 'h10',
          category: 'kin'
        };
      } else {
        const title = ctx.speakerGender === 'female' ? 'chị' : 'anh';
        const titleCap = title.charAt(0).toUpperCase() + title.slice(1);
        return {
          speaker: title,
          listener: 'em',
          politeParticle: 'nhé / nha em',
          explanation: `Anh chị em trong họ: lớn tuổi hơn xưng ${title}, gọi em.`,
          sampleSentence: `${titleCap} chào em, em cứ ngồi nghỉ chân uống bát nước chè xanh nhé!`,
          wisdomTip: 'Làm anh khó đấy, phải đâu chuyện đùa. Lời ăn tiếng nói của người anh cần đĩnh đạc và chân tình.',
          pairId: ctx.speakerGender === 'female' ? 'h13' : 'h12',
          category: 'kin'
        };
      }
    }

    // 6. Xã hội & Người lạ (social / stranger)
    if (ageDiff >= 20) {
      return {
        speaker: 'cháu',
        listener: 'bác',
        politeParticle: 'Dạ... ạ',
        explanation: "Đối với người trạc tuổi cha mẹ mình: xưng 'cháu', gọi 'bác' bày tỏ lòng tôn kính.",
        sampleSentence: 'Cháu chào Bác ạ! Bác sang chơi xơi nước với bố cháu nhé ạ!',
        wisdomTip: "Gọi 'Bác' xưng 'Cháu' vừa bày tỏ lòng kính trọng bề trên, vừa tạo sự ấm áp như người một nhà.",
        pairId: 'h3',
        category: 'social'
      };
    }

    if (ageDiff > 2) {
      const listenerTitle = ctx.listenerGender === 'female' ? 'chị' : 'anh';
      return {
        speaker: 'em',
        listener: listenerTitle,
        politeParticle: `ạ / nhé ${listenerTitle}`,
        explanation: `Đối phương lớn hơn vài tuổi: xưng 'em', gọi '${listenerTitle}'.`,
        sampleSentence: `Em chào ${listenerTitle}, ${listenerTitle} cho em hỏi thăm đường vào sân đình làng mình với ạ!`,
        wisdomTip: "Lời nói chẳng mất tiền mua, lựa lời mà nói cho vừa lòng nhau. Xưng 'em' gọi 'anh/chị' luôn mở ra thiện cảm.",
        pairId: ctx.listenerGender === 'female' ? 'h11' : 'h10',
        category: 'social'
      };
    }

    if (ageDiff < -2) {
      const speakerTitle = ctx.speakerGender === 'female' ? 'chị' : 'anh';
      const speakerCap = speakerTitle.charAt(0).toUpperCase() + speakerTitle.slice(1);
      return {
        speaker: speakerTitle,
        listener: 'em',
        politeParticle: 'nhé / nha em',
        explanation: `Đối phương nhỏ tuổi hơn: xưng '${speakerTitle}', gọi 'em'.`,
        sampleSentence: `${speakerCap} chào em, em cứ ngồi nghỉ chân uống bát nước chè xanh nhé!`,
        wisdomTip: 'Kính trên nhường dưới, xưng hô ân cần tạo dựng sự tin cậy trong giao tiếp.',
        pairId: ctx.speakerGender === 'female' ? 'h13' : 'h12',
        category: 'social'
      };
    }

    // Ngang hàng (ageDiff between -2 and 2)
    if (formality === 'intimate') {
      return {
        speaker: 'tớ',
        listener: 'cậu',
        politeParticle: 'nhé / nhé cậu / nha',
        explanation: 'Bạn bè đồng niên thân thiết ngõ xóm: xưng tớ, gọi cậu.',
        sampleSentence: 'Cậu ơi, chiều mát ra sân đình đá bóng và thả diều với tớ không nào?',
        wisdomTip: "Bạn bè chí cốt cùng làng cùng xóm, gọi 'tớ - cậu' vừa vô tư vừa gắn bó keo sơn.",
        pairId: 'h15',
        category: 'social'
      };
    }

    return {
      speaker: 'mình',
      listener: 'bạn',
      politeParticle: 'nhé / nha bạn',
      explanation: 'Bạn bè đồng trang lứa lịch thiệp xã giao: xưng mình, gọi bạn.',
      sampleSentence: 'Chào bạn, mình rất vui được làm quen với bạn tại ngày hội làng hôm nay nhé!',
      wisdomTip: "Tứ hải giai huynh đệ! Xưng 'mình - bạn' thanh lịch, giữ đúng mực thước văn minh hiện đại.",
      pairId: 'h14',
      category: 'social'
    };
  }

  /**
   * Định dạng kết quả từ cặp quan hệ tường minh
   */
  private formatPairResult(pair: HonorificPairItem, ctx: ContextExpression): HonorificInterpretationResult {
    let speaker = pair.speaker;
    let listener = pair.listener;
    let sampleSentence = pair.example;

    // Tinh chỉnh đại từ nếu có giới tính cụ thể
    if (pair.id === 'h2') {
      if (ctx.listenerGender === 'female') {
        listener = 'bà';
        sampleSentence = 'Dạ thưa Bà, cháu mới đi học về, cháu kính chúc Bà dồi dào sức khỏe ạ!';
      } else if (ctx.listenerGender === 'male') {
        listener = 'ông';
        sampleSentence = 'Dạ thưa Ông, cháu mới đi học về, cháu kính chúc Ông dồi dào sức khỏe ạ!';
      }
    } else if (pair.id === 'h6') {
      if (ctx.listenerGender === 'female') {
        listener = 'mẹ';
        sampleSentence = 'Con thưa Mẹ, con xin phép được chuẩn bị mâm cơm chiều gia đình ạ!';
      } else if (ctx.listenerGender === 'male') {
        listener = 'bố';
        sampleSentence = 'Con thưa Bố, con xin phép được chuẩn bị mâm cơm chiều gia đình ạ!';
      }
    } else if (pair.id === 'h8') {
      if (ctx.listenerGender === 'female') {
        listener = 'cô';
        sampleSentence = 'Em kính chào Cô ạ, thưa Cô bài giảng về phong tục làng xã hôm nay rất sâu sắc ạ!';
      } else if (ctx.listenerGender === 'male') {
        listener = 'thầy';
        sampleSentence = 'Em kính chào Thầy ạ, thưa Thầy bài giảng về phong tục làng xã hôm nay rất sâu sắc ạ!';
      }
    } else if (pair.id === 'h9') {
      if (ctx.speakerGender === 'female') {
        speaker = 'cô';
        sampleSentence = 'Cô khen em hôm nay đã có tinh thần tìm hiểu sâu về di sản văn hóa dân tộc nhé!';
      } else if (ctx.speakerGender === 'male') {
        speaker = 'thầy';
        sampleSentence = 'Thầy khen em hôm nay đã có tinh thần tìm hiểu sâu về di sản văn hóa dân tộc nhé!';
      }
    } else if (pair.id === 'h19') {
      if (ctx.listenerGender === 'female') {
        listener = 'thím';
        sampleSentence = 'Dạ cháu chào Thím ạ, Thím đã chuẩn bị nếp hương gói bánh chưng ăn Tết chưa ạ?';
      }
    }

    return {
      speaker,
      listener,
      politeParticle: pair.politeParticle,
      explanation: pair.explanation,
      sampleSentence,
      wisdomTip: pair.wisdom,
      pairId: pair.id,
      category: pair.relation
    };
  }

  /**
   * Lấy danh sách toàn bộ 20 cặp quan hệ mẫu
   */
  public getAllPairs(): HonorificPairItem[] {
    return HONORIFIC_PAIRS_20;
  }

  /**
   * Tìm cặp theo Id
   */
  public getPairById(id: string): HonorificPairItem | undefined {
    return HONORIFIC_PAIRS_20.find(p => p.id === id);
  }
}
