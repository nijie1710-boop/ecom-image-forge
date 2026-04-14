import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import logo from "@/assets/logo.png";

const EFFECTIVE_DATE = "2026 年 4 月 14 日";

const TermsPage = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-14 items-center gap-3 px-4 md:px-6">
          <Link
            to="/"
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <img src={logo} alt="PicSpark AI" className="h-6 w-6 rounded-lg object-contain" />
            <span className="text-sm font-bold">PicSpark AI</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-16">
        <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-foreground">用户协议</h1>
        <p className="mb-10 text-sm text-muted-foreground">生效日期：{EFFECTIVE_DATE}</p>

        <article className="prose-custom space-y-8 text-[15px] leading-relaxed text-foreground/85">
          {/* 1 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">一、协议概述</h2>
            <p>
              欢迎使用 PicSpark AI（以下简称"本平台"）。本平台由其运营方（以下简称"我们"）提供 AI 商品图片生成及相关增值服务。请您在使用前仔细阅读并充分理解本协议的全部内容。当您注册、登录或以任何方式使用本平台时，即视为您已阅读、理解并同意接受本协议的约束。
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">二、服务内容</h2>
            <p>本平台为用户提供以下服务：</p>
            <ul className="ml-4 mt-2 list-disc space-y-1 pl-2">
              <li>AI 商品主图生成：上传商品图片，通过 AI 模型生成电商场景主图；</li>
              <li>AI 详情页设计：自动规划版面并生成详情页屏图；</li>
              <li>AI 图文翻译：识别图片文字并生成多语言版本；</li>
              <li>其他我们不时推出的 AI 图像相关功能。</li>
            </ul>
            <p className="mt-2">
              我们有权根据业务发展需要，对服务内容进行更新、调整或终止部分功能，并将通过平台公告或站内通知等方式告知用户。
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">三、账号注册与安全</h2>
            <ol className="ml-4 list-decimal space-y-2 pl-2">
              <li>您在注册时应提供真实、准确、完整的个人信息，并在信息变更时及时更新。</li>
              <li>您的账号和密码由您自行保管。因账号密码泄露导致的任何损失，由您自行承担，但因我们过错导致的除外。</li>
              <li>如发现账号存在异常登录或被盗用情况，请立即联系我们进行处理。</li>
              <li>每位用户仅可注册一个账号，不得转让、借用、出租或出售账号。</li>
            </ol>
          </section>

          {/* 4 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">四、积分与充值</h2>
            <ol className="ml-4 list-decimal space-y-2 pl-2">
              <li>本平台采用积分制进行消费。用户使用 AI 生成服务时，系统将根据所选模型和分辨率自动扣除相应积分。</li>
              <li>积分可通过平台内的充值功能购买，支持支付宝等第三方支付方式。</li>
              <li>充值完成后积分立即到账，充值记录可在"充值中心"页面查看。</li>
              <li>已充值的积分不支持退款、提现或转让，但因我们服务故障导致积分异常扣除的，我们将在核实后予以补偿。</li>
              <li>我们有权根据运营情况调整积分定价与消费规则，调整前将提前通知用户。</li>
            </ol>
          </section>

          {/* 5 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">五、用户行为规范</h2>
            <p>您在使用本平台服务时，应遵守以下规范：</p>
            <ol className="ml-4 mt-2 list-decimal space-y-2 pl-2">
              <li>遵守中华人民共和国相关法律法规，不得利用本平台从事任何违法违规活动。</li>
              <li>不得上传、生成包含以下内容的图片：违法信息、色情或低俗内容、侵犯他人知识产权的内容、虚假或误导性信息、以及其他违反公序良俗的内容。</li>
              <li>不得对平台进行反向工程、破解、爬虫或其他可能影响服务正常运行的操作。</li>
              <li>不得利用技术手段绕过积分扣费机制或恶意消耗平台资源。</li>
            </ol>
            <p className="mt-2">
              如您违反上述规范，我们有权视情节严重程度采取警告、暂停服务、封禁账号等措施，且不退还剩余积分。
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">六、知识产权</h2>
            <ol className="ml-4 list-decimal space-y-2 pl-2">
              <li>本平台的软件、界面设计、图标、文案及底层 AI 模型等，其知识产权归我们或相关权利人所有。</li>
              <li>您上传至本平台的原始图片，其知识产权仍归您所有。您应确保上传内容不侵犯任何第三方的合法权益。</li>
              <li>通过本平台 AI 生成的图片，在法律允许的范围内，您可将其用于个人或商业用途（如电商商品展示等），但不得声称该 AI 生成内容为人工原创作品。</li>
            </ol>
          </section>

          {/* 7 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">七、免责声明</h2>
            <ol className="ml-4 list-decimal space-y-2 pl-2">
              <li>AI 生成的图片内容由算法模型自动产出，我们不对其准确性、适用性或合法性做出任何明示或暗示的保证。</li>
              <li>因不可抗力（包括但不限于自然灾害、网络故障、政策变化等）导致的服务中断或数据损失，我们不承担责任，但会尽最大努力恢复服务。</li>
              <li>您因使用本平台 AI 生成内容而产生的任何纠纷或损失，应由您自行承担，但因我们故意或重大过失造成的除外。</li>
            </ol>
          </section>

          {/* 8 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">八、协议修改</h2>
            <p>
              我们有权根据业务发展和法律法规变化对本协议进行修订。修订后的协议将在平台上公布，并于公布之日起生效。如您不同意修订后的内容，应立即停止使用本平台服务。继续使用即视为您同意修订后的协议。
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">九、法律适用与争议解决</h2>
            <p>
              本协议的订立、效力、解释及执行均适用中华人民共和国大陆地区法律。因本协议引起的或与本协议有关的争议，双方应友好协商解决；协商不成的，任何一方均可向我们所在地有管辖权的人民法院提起诉讼。
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="mb-3 text-lg font-bold text-foreground">十、联系我们</h2>
            <p>
              如您对本协议有任何疑问或建议，欢迎通过以下方式联系我们：
            </p>
            <ul className="ml-4 mt-2 list-disc space-y-1 pl-2">
              <li>邮箱：support@picspark.cn</li>
            </ul>
          </section>
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        <div className="container mx-auto px-4">
          <p>© 2026 PicSpark AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default TermsPage;
